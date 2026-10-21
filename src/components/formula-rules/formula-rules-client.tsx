"use client";

import React, { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import type { FormulaRuleItem } from "@/lib/formula-rules-actions";
import { updateCalculationRuleStatusAction } from "@/lib/formula-rules-actions";
import {
  Calculator,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Play,
  ArrowRight,
  Sparkles,
  Info,
  Clock,
  Layers,
  ArrowLeft,
  X,
  Code2,
  Sliders,
} from "lucide-react";

interface FormulaRulesClientProps {
  initialRules: FormulaRuleItem[];
}

export function FormulaRulesClient({ initialRules }: FormulaRulesClientProps) {
  const [rules, setRules] = useState<FormulaRuleItem[]>(initialRules);
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [selectedRule, setSelectedRule] = useState<FormulaRuleItem | null>(null);

  // Live simulation states for interactive test calculator
  const [simTarget, setSimTarget] = useState<number>(100);
  const [simActual, setSimActual] = useState<number>(110);
  const [isPending, startTransition] = useTransition();

  // Filtered rules
  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      const matchSearch =
        r.code.toLowerCase().includes(search.toLowerCase()) ||
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        (r.description && r.description.toLowerCase().includes(search.toLowerCase()));

      const matchType = selectedType === "ALL" || r.calculationType === selectedType;

      return matchSearch && matchType;
    });
  }, [rules, search, selectedType]);

  // Quick stats
  const activeCount = rules.filter((r) => r.status === "ACTIVE").length;
  const achievementCount = rules.filter((r) => r.calculationType === "ACHIEVEMENT").length;
  const aggregationCount = rules.filter((r) => r.calculationType === "AGGREGATION").length;

  // Toggle status handler
  const handleToggleStatus = (rule: FormulaRuleItem) => {
    const nextStatus = rule.status === "ACTIVE" ? "DEPRECATED" : "ACTIVE";
    const actionLabel = nextStatus === "ACTIVE" ? "Mengaktifkan" : "Menonaktifkan";

    void Swal.fire({
      title: `${actionLabel} Formula Rule?`,
      text: `Formula ${rule.code} akan diubah statusnya menjadi ${nextStatus}.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: nextStatus === "ACTIVE" ? "#059669" : "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: `Ya, Ubah Status`,
      cancelButtonText: "Batal",
    }).then((res) => {
      if (res.isConfirmed) {
        startTransition(async () => {
          try {
            await updateCalculationRuleStatusAction(rule.id, nextStatus);
            setRules((prev) =>
              prev.map((r) => (r.id === rule.id ? { ...r, status: nextStatus } : r))
            );
            if (selectedRule && selectedRule.id === rule.id) {
              setSelectedRule({ ...selectedRule, status: nextStatus });
            }
            void Swal.fire({
              icon: "success",
              title: "Status Diperbarui",
              text: `Formula rule ${rule.code} kini berstatus ${nextStatus}.`,
              timer: 1500,
              showConfirmButton: false,
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Gagal memperbarui status rule";
            void Swal.fire({ icon: "error", title: "Gagal", text: msg });
          }
        });
      }
    });
  };

  // Simulation calculation
  const simulationResult = useMemo(() => {
    if (!selectedRule) return null;

    if (selectedRule.calculationType === "ACHIEVEMENT") {
      if (selectedRule.direction === "INVERSE") {
        if (simActual === 0) return { pct: 100, formula: "Target / Actual (Zero actual = 100%)" };
        const res = (simTarget / simActual) * 100;
        return {
          pct: parseFloat(res.toFixed(2)),
          formula: `(${simTarget} / ${simActual}) × 100% = ${res.toFixed(2)}%`,
          desc: "Inverse: Nilai aktual lebih kecil daripada target menghasilkan pencapaian lebih tinggi.",
        };
      } else {
        if (simTarget === 0) return { pct: 0, formula: "Actual / Target (Zero target = 0%)" };
        const res = (simActual / simTarget) * 100;
        return {
          pct: parseFloat(res.toFixed(2)),
          formula: `(${simActual} / ${simTarget}) × 100% = ${res.toFixed(2)}%`,
          desc: "Normal: Nilai aktual lebih tinggi daripada target menghasilkan pencapaian lebih tinggi.",
        };
      }
    }

    if (selectedRule.calculationType === "WEIGHTING") {
      return {
        pct: 25,
        formula: `(Skor / 25) × (Bobot Indikator / 100) × Bobot Parameter`,
        desc: "Formula kontribusi bobot efektif berjenjang terhadap total skor evaluasi KPI tahunan.",
      };
    }

    return {
      pct: null,
      formula: `Aggregasi bulanan menggunakan metode ${selectedRule.aggregationMethod || "AVERAGE"}`,
      desc: "Menghitung nilai kumulatif 12 bulan dari transaksi appraisal_monthly_values.",
    };
  }, [selectedRule, simTarget, simActual]);

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition active:scale-95 shadow-2xs"
            title="Kembali ke Admin Menu"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Master Formula Engine Rules
              </h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                v1 Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Daftar aturan perhitungan pencapaian, aggregasi bulanan, dan versioning formula KPI
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/setup/templates"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
          >
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <span>Ke Template KPI</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Total Rules
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-slate-900">{rules.length}</span>
            <span className="text-[11px] text-emerald-600 font-semibold">
              {activeCount} Aktif
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Achievement Rules
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-blue-700">{achievementCount}</span>
            <span className="text-[11px] text-slate-400">Normal & Inverse</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Aggregation Rules
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-indigo-700">{aggregationCount}</span>
            <span className="text-[11px] text-slate-400">Avg, Sum, Last, Ratio</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Trace / Audit Engine
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Active Logging
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode formula, nama, atau deskripsi..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/50 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-semibold text-slate-400 shrink-0">Tipe:</span>
          {["ALL", "ACHIEVEMENT", "AGGREGATION", "WEIGHTING"].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer ${
                selectedType === type
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {type === "ALL" ? "Semua" : type}
            </button>
          ))}
        </div>
      </div>

      {/* Rules Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-3 w-12 text-center">No</th>
                <th className="p-3">Kode Formula</th>
                <th className="p-3">Nama & Deskripsi</th>
                <th className="p-3">Kategori Kalkulasi</th>
                <th className="p-3">Rumus / Logika</th>
                <th className="p-3 text-center">Indikator Terhubung</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 text-slate-800">
              {filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 text-xs">
                    Tidak ada formula rule yang cocok dengan pencarian atau filter.
                  </td>
                </tr>
              ) : (
                filteredRules.map((rule, idx) => {
                  const isAchievement = rule.calculationType === "ACHIEVEMENT";
                  const isInverse = rule.direction === "INVERSE";

                  return (
                    <tr
                      key={rule.id}
                      className="hover:bg-slate-50/80 transition cursor-pointer"
                      onClick={() => setSelectedRule(rule)}
                    >
                      <td className="p-3 text-center text-slate-400 font-mono">
                        {idx + 1}
                      </td>
                      <td className="p-3">
                        <span className="font-mono font-bold text-xs text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded border border-indigo-200/60">
                          {rule.code}
                        </span>
                      </td>
                      <td className="p-3 max-w-xs">
                        <div className="font-semibold text-slate-900">{rule.name}</div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {rule.description || "—"}
                        </p>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              rule.calculationType === "ACHIEVEMENT"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : rule.calculationType === "AGGREGATION"
                                ? "bg-purple-50 text-purple-700 border border-purple-200"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            }`}
                          >
                            {rule.calculationType}
                          </span>
                          {isAchievement && (
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                isInverse
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-teal-50 text-teal-700 border border-teal-200"
                              }`}
                            >
                              {rule.direction}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-600">
                        {isAchievement
                          ? isInverse
                            ? "(Target / Actual) × 100%"
                            : "(Actual / Target) × 100%"
                          : rule.calculationType === "WEIGHTING"
                          ? "(Score / 25) × W_ind × W_param"
                          : `Aggregasi: ${rule.aggregationMethod || "AVERAGE"}`}
                      </td>
                      <td className="p-3 text-center">
                        <span className="font-semibold text-slate-700">
                          {rule.linkedParametersCount}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            rule.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-500 border border-slate-200"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              rule.status === "ACTIVE" ? "bg-emerald-600" : "bg-slate-400"
                            }`}
                          />
                          {rule.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRule(rule);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                        >
                          Detail & Test
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal / Drawer Detail & Live Simulator */}
      {selectedRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <Calculator className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">
                      {selectedRule.name}
                    </span>
                    <span className="font-mono text-xs font-bold text-indigo-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {selectedRule.code}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Versi {selectedRule.version} · Efektif sejak {selectedRule.effectiveDate}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRule(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              {/* Deskripsi & Logika */}
              <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/50 space-y-2">
                <span className="font-bold text-slate-800 text-xs block">
                  Deskripsi & Karakteristik Aturan
                </span>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  {selectedRule.description || "Tidak ada deskripsi rinci untuk formula ini."}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200/70 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Tipe Kalkulasi</span>
                    <span className="font-bold text-slate-800">{selectedRule.calculationType}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Arah (Direction)</span>
                    <span className="font-bold text-slate-800">{selectedRule.direction || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Indikator Terkait</span>
                    <span className="font-bold text-indigo-700">
                      {selectedRule.linkedParametersCount} Indikator KPI
                    </span>
                  </div>
                </div>
              </div>

              {/* JSON Formula Configuration Display */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
                  <Code2 className="h-4 w-4 text-slate-500" />
                  <span>Struktur Formula Config (JSON Engine)</span>
                </div>
                <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800">
                  {JSON.stringify(selectedRule.formulaConfig, null, 2)}
                </pre>
              </div>

              {/* Interactive Simulation / Test Bench */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
                    <Play className="h-4 w-4 text-blue-600 fill-blue-600" />
                    <span>Simulator Kalkulasi Interaktif</span>
                  </div>
                  <span className="text-[10px] text-blue-600 font-medium">Uji Coba Langsung</span>
                </div>

                {selectedRule.calculationType === "ACHIEVEMENT" ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Nilai Target
                        </label>
                        <input
                          type="number"
                          value={simTarget}
                          onChange={(e) => setSimTarget(Number(e.target.value))}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Nilai Realisasi (Actual)
                        </label>
                        <input
                          type="number"
                          value={simActual}
                          onChange={(e) => setSimActual(Number(e.target.value))}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {simulationResult && (
                      <div className="p-3 rounded-lg bg-white border border-blue-200 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-slate-500">
                            Hasil Achievement:
                          </span>
                          <span className="text-base font-extrabold font-mono text-blue-700">
                            {simulationResult.pct}%
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-600">
                          {simulationResult.formula}
                        </div>
                        <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-100">
                          {simulationResult.desc}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-white border border-blue-200">
                    <div className="font-mono text-[11px] text-slate-700 font-semibold">
                      {simulationResult?.formula}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {simulationResult?.desc}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleToggleStatus(selectedRule)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    selectedRule.status === "ACTIVE"
                      ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                      : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  {selectedRule.status === "ACTIVE" ? "Nonaktifkan Rule" : "Aktifkan Rule"}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRule(null)}
                className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
