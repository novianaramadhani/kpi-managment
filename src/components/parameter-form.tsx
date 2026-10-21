"use client";

import { useState, useTransition } from "react";
import Swal from "sweetalert2";
import type { KpiParameter } from "@/db/schema";
import { btnAmber, inputCls, inputErrorCls } from "./ui";

export function ParameterForm({
  action,
  templateId,
  categoryId,
  param,
}: {
  action: (fd: FormData) => Promise<void>;
  templateId: number;
  categoryId: number;
  param?: KpiParameter;
}) {
  const [name, setName] = useState(param?.name ?? "");
  const [description, setDescription] = useState(param?.description ?? "");
  const [weight, setWeight] = useState(param ? String(Number(param.weight) * 100) : "100");
  const [maxScore, setMaxScore] = useState(param ? String(Number(param.maxScore)) : "25");
  const [inputType, setInputType] = useState(param?.inputType ?? "NUMBER");
  const [aggregation, setAggregation] = useState(param?.aggregation ?? "AVERAGE");
  const [compareBasis, setCompareBasis] = useState(param?.compareBasis ?? "ACTUAL");
  const [unit, setUnit] = useState(param?.unit ?? "");
  const [picRole, setPicRole] = useState(param?.picRole ?? "HEAD_DEPT");
  const [sortOrder, setSortOrder] = useState(param ? String(param.sortOrder) : "0");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Penjagaan (Validation Guard) untuk seluruh field parameter
    const errors: Record<string, string> = {};
    const trimmedName = name.trim();

    if (!trimmedName) {
      errors.name = "Nama Parameter wajib diisi!";
    }

    const numWeight = Number(weight);
    if (!weight || isNaN(numWeight) || numWeight <= 0) {
      errors.weight = "Bobot P harus diisi angka lebih dari 0!";
    } else if (numWeight > 100) {
      errors.weight = "Bobot P maksimal 100%!";
    }

    const numScore = Number(maxScore);
    if (!maxScore || isNaN(numScore) || numScore <= 0) {
      errors.maxScore = "Skor Maksimal harus diisi angka lebih dari 0!";
    }

    if (!inputType) {
      errors.inputType = "Tipe Input wajib dipilih!";
    }

    if (inputType === "MONTHLY_ACTUAL" && !aggregation) {
      errors.aggregation = "Metode Tahunan wajib dipilih untuk tipe Monthly Actual!";
    }

    if (!compareBasis) {
      errors.compareBasis = "Basis Band wajib dipilih!";
    }

    if (!picRole) {
      errors.picRole = "PIC Input wajib dipilih!";
    }

    const numSort = Number(sortOrder);
    if (sortOrder === "" || isNaN(numSort) || numSort < 0) {
      errors.sortOrder = "Urutan harus berupa angka (minimal 0)!";
    }

    setFieldErrors(errors);

    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      const errorList = Object.values(errors);
      void Swal.fire({
        icon: "warning",
        title: "Field Belum Lengkap",
        html: `
          <div style="text-align: left; font-size: 14px; line-height: 1.6;">
            <p style="margin-bottom: 8px; font-weight: 600; color: #b45309;">Silakan lengkapi field berikut sebelum menyimpan:</p>
            <ul style="list-style-type: disc; padding-left: 20px; color: #dc2626;">
              ${errorList.map((err) => `<li>${err}</li>`).join("")}
            </ul>
          </div>
        `,
        confirmButtonColor: "#f59e0b",
        confirmButtonText: "Perbaiki Data",
      });
      return;
    }

    const fd = new FormData();
    if (param) fd.append("id", String(param.id));
    fd.append("templateId", String(templateId));
    fd.append("categoryId", String(categoryId));
    fd.append("name", trimmedName);
    fd.append("description", description.trim());
    fd.append("weight", weight);
    fd.append("maxScore", maxScore);
    fd.append("inputType", inputType);
    fd.append("aggregation", aggregation);
    fd.append("compareBasis", compareBasis);
    fd.append("unit", unit.trim());
    fd.append("picRole", picRole);
    fd.append("sortOrder", sortOrder);

    startTransition(async () => {
      try {
        await action(fd);
        await Swal.fire({
          icon: "success",
          title: "Berhasil Disimpan!",
          text: param
            ? `Parameter "${trimmedName}" berhasil diperbarui.`
            : `Parameter "${trimmedName}" berhasil ditambahkan.`,
          confirmButtonColor: "#f59e0b",
          timer: 2000,
          timerProgressBar: true,
        });

        // Reset form jika menambahkan parameter baru
        if (!param) {
          setName("");
          setDescription("");
          setWeight("100");
          setMaxScore("25");
          setInputType("NUMBER");
          setAggregation("AVERAGE");
          setCompareBasis("ACTUAL");
          setUnit("");
          setPicRole("HEAD_DEPT");
          setSortOrder("0");
          setFieldErrors({});
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan parameter.";
        await Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: message,
          confirmButtonColor: "#f59e0b",
          confirmButtonText: "Tutup",
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
      {/* Nama Parameter */}
      <div className="col-span-2">
        <label className="block font-medium text-slate-700">
          Nama Parameter <span className="text-rose-500">*</span>
        </label>
        <input
          name="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clearFieldError("name");
          }}
          placeholder="Contoh: Pemenuhan Kebutuhan User"
          className={fieldErrors.name ? inputErrorCls : inputCls}
        />
        {fieldErrors.name && <p className="mt-1 text-xs text-rose-600 font-medium">{fieldErrors.name}</p>}
      </div>

      {/* Deskripsi */}
      <div className="col-span-2">
        <label className="block font-medium text-slate-700">Deskripsi</label>
        <input
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Keterangan parameter (opsional)"
          className={inputCls}
        />
      </div>

      {/* Bobot P (%) */}
      <div>
        <label className="block font-medium text-slate-700">
          Bobot P (%) <span className="text-rose-500">*</span>
        </label>
        <input
          name="weight"
          type="number"
          step="0.01"
          value={weight}
          onChange={(e) => {
            setWeight(e.target.value);
            clearFieldError("weight");
          }}
          placeholder="Contoh: 20"
          className={fieldErrors.weight ? inputErrorCls : inputCls}
        />
        {fieldErrors.weight && <p className="mt-1 text-xs text-rose-600 font-medium">{fieldErrors.weight}</p>}
      </div>

      {/* Skor Max */}
      <div>
        <label className="block font-medium text-slate-700">
          Skor Max <span className="text-rose-500">*</span>
        </label>
        <input
          name="maxScore"
          type="number"
          step="any"
          value={maxScore}
          onChange={(e) => {
            setMaxScore(e.target.value);
            clearFieldError("maxScore");
          }}
          placeholder="Contoh: 25"
          className={fieldErrors.maxScore ? inputErrorCls : inputCls}
        />
        {fieldErrors.maxScore && <p className="mt-1 text-xs text-rose-600 font-medium">{fieldErrors.maxScore}</p>}
      </div>

      {/* Input Type */}
      <div>
        <label className="block font-medium text-slate-700">
          Input Type <span className="text-rose-500">*</span>
        </label>
        <select
          name="inputType"
          value={inputType}
          onChange={(e) => {
            const val = e.target.value as KpiParameter["inputType"];
            setInputType(val);
            clearFieldError("inputType");
          }}
          className={fieldErrors.inputType ? inputErrorCls : inputCls}
        >
          <option value="PERCENTAGE">Percentage (%)</option>
          <option value="NUMBER">Number</option>
          <option value="CURRENCY">Currency (Rp)</option>
          <option value="MONTHLY_ACTUAL">Monthly Actual</option>
          <option value="QUALITATIVE">Qualitative</option>
        </select>
        {fieldErrors.inputType && <p className="mt-1 text-xs text-rose-600 font-medium">{fieldErrors.inputType}</p>}
      </div>

      {/* Metode Tahunan (monthly) */}
      <div>
        <label className="block font-medium text-slate-700">
          Metode Tahunan {inputType === "MONTHLY_ACTUAL" && <span className="text-rose-500">*</span>}
        </label>
        <select
          name="aggregation"
          value={aggregation}
          onChange={(e) => {
            const val = e.target.value as "AVERAGE" | "SUM" | "LAST_VALUE" | "RATIO";
            setAggregation(val);
            clearFieldError("aggregation");
          }}
          disabled={inputType !== "MONTHLY_ACTUAL"}
          className={fieldErrors.aggregation ? inputErrorCls : inputCls}
        >
          <option value="AVERAGE">Average (Rata-rata)</option>
          <option value="SUM">Sum (Total)</option>
          <option value="LAST_VALUE">Last Value (Nilai Akhir)</option>
          <option value="RATIO">Ratio (ΣA/ΣT %)</option>
        </select>
        {fieldErrors.aggregation && <p className="mt-1 text-xs text-rose-600 font-medium">{fieldErrors.aggregation}</p>}
      </div>

      {/* Basis Band */}
      <div>
        <label className="block font-medium text-slate-700">
          Basis Band <span className="text-rose-500">*</span>
        </label>
        <select
          name="compareBasis"
          value={compareBasis}
          onChange={(e) => {
            const val = e.target.value as "ACTUAL" | "ACHIEVEMENT";
            setCompareBasis(val);
            clearFieldError("compareBasis");
          }}
          className={fieldErrors.compareBasis ? inputErrorCls : inputCls}
        >
          <option value="ACTUAL">Nilai Actual Langsung</option>
          <option value="ACHIEVEMENT">% Achievement (Actual/Target)</option>
        </select>
      </div>

      {/* Unit */}
      <div>
        <label className="block font-medium text-slate-700">Unit Satuan</label>
        <input
          name="unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="%, Rp, unit, hari"
          className={inputCls}
        />
      </div>

      {/* PIC Input */}
      <div>
        <label className="block font-medium text-slate-700">
          PIC Input <span className="text-rose-500">*</span>
        </label>
        <select
          name="picRole"
          value={picRole}
          onChange={(e) => {
            const val = e.target.value as "HEAD_DEPT" | "HR" | "HSE" | "SUPERINTENDENT";
            setPicRole(val);
            clearFieldError("picRole");
          }}
          className={fieldErrors.picRole ? inputErrorCls : inputCls}
        >
          <option value="HEAD_DEPT">Head Dept</option>
          <option value="SUPERINTENDENT">Superintendent</option>
          <option value="HR">HR</option>
          <option value="HSE">HSE</option>
        </select>
        {fieldErrors.picRole && <p className="mt-1 text-xs text-rose-600 font-medium">{fieldErrors.picRole}</p>}
      </div>

      {/* Urutan */}
      <div>
        <label className="block font-medium text-slate-700">
          Urutan <span className="text-rose-500">*</span>
        </label>
        <input
          name="sortOrder"
          type="number"
          value={sortOrder}
          onChange={(e) => {
            setSortOrder(e.target.value);
            clearFieldError("sortOrder");
          }}
          className={fieldErrors.sortOrder ? inputErrorCls : inputCls}
        />
        {fieldErrors.sortOrder && <p className="mt-1 text-xs text-rose-600 font-medium">{fieldErrors.sortOrder}</p>}
      </div>

      {/* Submit Button */}
      <div className="col-span-2 mt-2 md:col-span-4">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 hover:bg-[#0369a1] active:scale-95 text-white font-bold px-5 py-2.5 text-sm shadow-sm hover:shadow transition disabled:opacity-50 cursor-pointer"
        >
          {isPending ? (
            <>
              <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Menyimpan Parameter...</span>
            </>
          ) : (
            <span>{param ? "💾 Simpan Perubahan Parameter" : "+ Tambah Parameter Baru"}</span>
          )}
        </button>
      </div>
    </form>
  );
}
