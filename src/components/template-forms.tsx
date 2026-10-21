"use client";

import { useState, useTransition } from "react";
import Swal from "sweetalert2";
import type { Department, JobLevel, KpiTemplate } from "@/db/schema";
import { btnAmber, btnAmberSmall, btnDanger, btnSecondary, inputCls } from "./ui";

export function AddCategoryForm({
  templateId,
  currentLength,
  action,
}: {
  templateId: number;
  currentLength: number;
  action: (fd: FormData) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [sortOrder, setSortOrder] = useState(String(currentLength));
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      void Swal.fire({
        icon: "warning",
        title: "Nama Parameter Wajib Diisi",
        text: "Silakan masukkan nama parameter baru.",
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    const numWeight = Number(weight);
    if (!weight || isNaN(numWeight) || numWeight <= 0) {
      void Swal.fire({
        icon: "warning",
        title: "Bobot Tidak Valid",
        text: "Bobot parameter harus diisi angka lebih dari 0%!",
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    const fd = new FormData();
    fd.append("templateId", String(templateId));
    fd.append("name", trimmed);
    fd.append("weight", weight);
    fd.append("sortOrder", sortOrder);

    startTransition(async () => {
      try {
        await action(fd);
        await Swal.fire({
          icon: "success",
          title: "Parameter Ditambahkan!",
          text: `Parameter "${trimmed}" berhasil dibuat.`,
          confirmButtonColor: "#f59e0b",
          timer: 1800,
          timerProgressBar: true,
        });
        setName("");
        setWeight("");
        setSortOrder(String(currentLength + 1));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menambahkan parameter";
        await Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: msg,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 text-sm">
      <label className="flex-1 min-w-[200px]">
        <span className="block font-medium text-slate-700">Nama Parameter <span className="text-rose-500">*</span></span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Contoh: Target Kerja"
          className={inputCls}
        />
      </label>
      <label>
        <span className="block font-medium text-slate-700">Bobot Parameter (%) <span className="text-rose-500">*</span></span>
        <input
          name="weight"
          type="number"
          step="0.01"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="65"
          className={`${inputCls} w-28`}
        />
      </label>
      <label>
        <span className="block font-medium text-slate-700">Urutan</span>
        <input
          name="sortOrder"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className={`${inputCls} w-20`}
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 h-[38px] text-sm shadow-xs transition active:scale-98 disabled:opacity-50 cursor-pointer"
      >
        {isPending ? "Menambahkan..." : "+ Tambah Parameter"}
      </button>
    </form>
  );
}

export function TemplateSettingsForm({
  template,
  action,
}: {
  template: KpiTemplate;
  action: (fd: FormData) => Promise<void>;
}) {
  const [name, setName] = useState(template.name);
  const [totalWeight, setTotalWeight] = useState(String(Number(template.totalWeight)));
  const [isActive, setIsActive] = useState(String(template.isActive));
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      void Swal.fire({
        icon: "warning",
        title: "Nama Template Wajib Diisi",
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    const numWeight = Number(totalWeight);
    if (!totalWeight || isNaN(numWeight) || numWeight <= 0) {
      void Swal.fire({
        icon: "warning",
        title: "Total Bobot Tidak Valid",
        text: "Total bobot harus berupa angka lebih dari 0!",
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    const fd = new FormData();
    fd.append("id", String(template.id));
    fd.append("name", trimmed);
    fd.append("totalWeight", totalWeight);
    fd.append("isActive", isActive);

    startTransition(async () => {
      try {
        await action(fd);
        await Swal.fire({
          icon: "success",
          title: "Pengaturan Tersimpan!",
          text: "Pengaturan template berhasil diperbarui.",
          confirmButtonColor: "#f59e0b",
          timer: 1800,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan template";
        await Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: msg,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-sm">
      <label className="block">
        <span className="font-medium text-slate-700">Nama Template</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="font-medium text-slate-700">Total Bobot (1.0 = 100%, 1.15 = 115%)</span>
        <input
          name="totalWeight"
          type="number"
          step="0.01"
          value={totalWeight}
          onChange={(e) => setTotalWeight(e.target.value)}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="font-medium text-slate-700">Status</span>
        <select
          name="isActive"
          value={isActive}
          onChange={(e) => setIsActive(e.target.value)}
          className={inputCls}
        >
          <option value="true">Aktif</option>
          <option value="false">Nonaktif</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-500 hover:bg-[#0369a1] active:scale-95 text-white font-bold px-4 py-2.5 text-sm shadow-sm hover:shadow transition disabled:opacity-50 cursor-pointer w-full"
      >
        {isPending ? "Menyimpan..." : "💾 Simpan Pengaturan"}
      </button>
    </form>
  );
}

export function AddBandForm({
  parameterId,
  templateId,
  defaultOperator,
  currentLength,
  action,
}: {
  parameterId: number;
  templateId: number;
  defaultOperator: string;
  currentLength: number;
  action: (fd: FormData) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [operator, setOperator] = useState(defaultOperator);
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [score, setScore] = useState("");
  const [sortOrder, setSortOrder] = useState(String(currentLength));
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      void Swal.fire({
        icon: "warning",
        title: "Label Band Wajib Diisi",
        text: "Contoh: >95% atau Sangat Baik",
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    if (score === "" || isNaN(Number(score))) {
      void Swal.fire({
        icon: "warning",
        title: "Skor Band Wajib Diisi",
        text: "Skor band harus berupa angka.",
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    const fd = new FormData();
    fd.append("parameterId", String(parameterId));
    fd.append("templateId", String(templateId));
    fd.append("label", trimmedLabel);
    fd.append("operator", operator);
    fd.append("minValue", minValue);
    fd.append("maxValue", maxValue);
    fd.append("score", score);
    fd.append("sortOrder", sortOrder);

    startTransition(async () => {
      try {
        await action(fd);
        await Swal.fire({
          icon: "success",
          title: "Band Ditambahkan!",
          text: `Kriteria "${trimmedLabel}" berhasil ditambahkan.`,
          confirmButtonColor: "#f59e0b",
          timer: 1600,
          timerProgressBar: true,
        });
        setLabel("");
        setMinValue("");
        setMaxValue("");
        setScore("");
        setSortOrder(String(currentLength + 1));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menambahkan band";
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
    <form onSubmit={handleSubmit} className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-7">
      <input
        name="label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (mis. >95%) *"
        className={`${inputCls} md:col-span-2`}
      />
      <select
        name="operator"
        value={operator}
        onChange={(e) => setOperator(e.target.value)}
        className={inputCls}
      >
        <option value="GT">&gt; min</option>
        <option value="GTE">≥ min</option>
        <option value="LT">&lt; max</option>
        <option value="LTE">≤ max</option>
        <option value="EQ">= min</option>
        <option value="BETWEEN">min – max</option>
        <option value="TEXT">Teks (kualitatif)</option>
      </select>
      <input
        name="minValue"
        type="number"
        step="any"
        value={minValue}
        onChange={(e) => setMinValue(e.target.value)}
        placeholder="Min"
        className={inputCls}
      />
      <input
        name="maxValue"
        type="number"
        step="any"
        value={maxValue}
        onChange={(e) => setMaxValue(e.target.value)}
        placeholder="Max"
        className={inputCls}
      />
      <input
        name="score"
        type="number"
        step="any"
        value={score}
        onChange={(e) => setScore(e.target.value)}
        placeholder="Skor *"
        className={inputCls}
      />
      <input
        name="sortOrder"
        type="number"
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
        title="Urutan evaluasi"
        className={inputCls}
      />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-800 via-[#0369a1] to-[#0f3e22] hover:from-emerald-900 hover:to-slate-950 text-white font-semibold px-4 py-2.5 text-xs shadow-xs hover:shadow-md transition-all active:scale-[0.99] md:col-span-7 disabled:opacity-50 cursor-pointer"
      >
        {isPending ? (
          <>
            <svg className="h-3.5 w-3.5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Menambahkan Kriteria Band...</span>
          </>
        ) : (
          <>
            <span className="flex h-4 w-4 items-center justify-center rounded-md bg-white/20 text-xs font-bold leading-none text-white shadow-2xs">
              +
            </span>
            <span className="font-semibold tracking-wide">Tambah Band Kriteria</span>
          </>
        )}
      </button>
    </form>
  );
}

export function DeleteActionForm({
  action,
  title,
  text,
  className = btnDanger,
  children,
}: {
  action: (fd: FormData) => Promise<void>;
  title: string;
  text: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [isPending, startTransition] = useTransition();

  const handleConfirm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

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
          await action(fd);
          await Swal.fire({
            icon: "success",
            title: "Berhasil Dihapus",
            timer: 1500,
            showConfirmButton: false,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Gagal menghapus data";
          await Swal.fire({
            icon: "error",
            title: "Gagal Menghapus",
            text: msg,
            confirmButtonColor: "#f59e0b",
          });
        }
      });
    }
  };

  return (
    <form onSubmit={handleConfirm}>
      <button type="submit" disabled={isPending} className={className}>
        {isPending ? "..." : children}
      </button>
    </form>
  );
}

export function DuplicateTemplateForm({
  templateId,
  departments,
  jobLevels,
  action,
}: {
  templateId: number;
  departments: Department[];
  jobLevels: JobLevel[];
  action: (fd: FormData) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState(String(departments[0]?.id ?? ""));
  const [jobLevelId, setJobLevelId] = useState(String(jobLevels[0]?.id ?? ""));
  const [isPending, startTransition] = useTransition();

  const handleDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();

    const targetDept = departments.find((d) => String(d.id) === departmentId)?.name ?? "";
    const targetLvl = jobLevels.find((l) => String(l.id) === jobLevelId)?.name ?? "";

    const confirm = await Swal.fire({
      title: "Duplikasi Template?",
      text: `Buat salinan template ini untuk ${targetDept} (${targetLvl})?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#0284c7",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Duplikasi",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const fd = new FormData();
    fd.append("id", String(templateId));
    if (name.trim()) fd.append("name", name.trim());
    fd.append("departmentId", departmentId);
    fd.append("jobLevelId", jobLevelId);

    startTransition(async () => {
      try {
        await Swal.fire({
          icon: "info",
          title: "Menduplikasi...",
          text: "Menyalin parameter dan indikator kriteria KPI...",
          showConfirmButton: false,
          timer: 1200,
        });
        await action(fd);
      } catch (err: unknown) {
        if (
          err &&
          typeof err === "object" &&
          "digest" in err &&
          String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
        ) {
          throw err;
        }
        const msg = err instanceof Error ? err.message : "Gagal menduplikasi template";
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
    <form onSubmit={handleDuplicate} className="space-y-2 text-sm">
      <div className="font-medium text-slate-800">Duplikasi ke Dept/Level lain</div>
      <input
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nama template baru (opsional)"
        className={inputCls}
      />
      <select
        name="departmentId"
        value={departmentId}
        onChange={(e) => setDepartmentId(e.target.value)}
        className={inputCls}
      >
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select
        name="jobLevelId"
        value={jobLevelId}
        onChange={(e) => setJobLevelId(e.target.value)}
        className={inputCls}
      >
        {jobLevels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={isPending} className={btnSecondary}>
        {isPending ? "Menduplikasi..." : "Duplikasi Template"}
      </button>
    </form>
  );
}
