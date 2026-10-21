"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { Trash2 } from "lucide-react";
import { btnDanger, btnPrimary, inputCls } from "./ui";

// ==========================================
// 1. DEPARTEMEN FORMS
// ==========================================

export function DepartmentForm({
  action,
}: {
  action: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Field Belum Lengkap",
        text: "Kode dan Nama Departemen wajib diisi!",
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    const fd = new FormData();
    fd.append("code", code.trim());
    fd.append("name", name.trim());

    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Departemen Disimpan!",
          text: `Departemen ${name} (${code.toUpperCase()}) berhasil ditambahkan.`,
          confirmButtonColor: "#0284c7",
          timer: 1800,
          timerProgressBar: true,
        });
        setCode("");
        setName("");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan departemen.";
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
    <form onSubmit={handleSubmit} className="space-y-3.5 text-sm">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">
          Kode Departemen <span className="text-rose-500">*</span>
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Contoh: HSE, HRD, LOG"
          required
          className={inputCls}
        />
        <p className="mt-1 text-[11px] text-slate-400">Kode unik singkatan departemen.</p>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">
          Nama Departemen <span className="text-rose-500">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Contoh: Health Safety Environment"
          required
          className={inputCls}
        />
      </div>

      <div className="pt-2">
        <button type="submit" disabled={isPending} className={`${btnPrimary} w-full`}>
          {isPending ? "Menyimpan..." : "+ Simpan Departemen"}
        </button>
      </div>
    </form>
  );
}

export function DeleteDepartmentButton({
  id,
  name,
  disabled,
  action,
}: {
  id: number;
  name: string;
  disabled?: boolean;
  action: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = async () => {
    const confirm = await Swal.fire({
      title: "Hapus Departemen?",
      text: `Departemen "${name}" akan dihapus permanen dari sistem.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const fd = new FormData();
    fd.append("id", String(id));

    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Departemen Dihapus",
          text: `Departemen "${name}" berhasil dihapus.`,
          confirmButtonColor: "#0284c7",
          timer: 1500,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus";
        await Swal.fire({
          icon: "error",
          title: "Gagal Menghapus",
          text: msg,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={disabled || isPending}
      className={`p-1.5 text-slate-400 hover:text-rose-600 transition cursor-pointer ${
        disabled ? "opacity-30 cursor-not-allowed hover:text-slate-400" : ""
      }`}
      title={
        disabled
          ? "Tidak dapat dihapus karena masih ada karyawan di departemen ini"
          : "Hapus departemen"
      }
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}

// ==========================================
// 2. JOB LEVEL FORMS
// ==========================================

export function JobLevelForm({
  action,
}: {
  action: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [rank, setRank] = useState("1");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Field Belum Lengkap",
        text: "Kode dan Nama Job Level wajib diisi!",
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    const fd = new FormData();
    fd.append("code", code.trim());
    fd.append("name", name.trim());
    fd.append("rank", rank);

    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Job Level Disimpan!",
          text: `Job Level ${name} (${code.toUpperCase()}) Rank ${rank} berhasil ditambahkan.`,
          confirmButtonColor: "#0284c7",
          timer: 1800,
          timerProgressBar: true,
        });
        setCode("");
        setName("");
        setRank("1");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan job level.";
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
    <form onSubmit={handleSubmit} className="space-y-3.5 text-sm">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">
          Kode Level <span className="text-rose-500">*</span>
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Contoh: MGR, SPV, STAFF"
          required
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">
          Nama Job Level <span className="text-rose-500">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Contoh: Manager, Supervisor, Staff"
          required
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">
          Rank / Tingkatan (1 - 7) <span className="text-rose-500">*</span>
        </label>
        <input
          type="number"
          min={1}
          max={10}
          value={rank}
          onChange={(e) => setRank(e.target.value)}
          required
          className={inputCls}
        />
        <p className="mt-1 text-[11px] text-slate-400">
          Tingkatan hirarki dalam perusahaan (Rank 1 terendah s/d Rank 7 tertinggi).
        </p>
      </div>

      <div className="pt-2">
        <button type="submit" disabled={isPending} className={`${btnPrimary} w-full`}>
          {isPending ? "Menyimpan..." : "+ Simpan Job Level"}
        </button>
      </div>
    </form>
  );
}

export function DeleteJobLevelButton({
  id,
  name,
  disabled,
  action,
}: {
  id: number;
  name: string;
  disabled?: boolean;
  action: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = async () => {
    const confirm = await Swal.fire({
      title: "Hapus Job Level?",
      text: `Job Level "${name}" akan dihapus dari sistem.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    const fd = new FormData();
    fd.append("id", String(id));

    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Job Level Dihapus",
          text: `Job Level "${name}" berhasil dihapus.`,
          confirmButtonColor: "#0284c7",
          timer: 1500,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menghapus";
        await Swal.fire({
          icon: "error",
          title: "Gagal Menghapus",
          text: msg,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={disabled || isPending}
      className={`p-1.5 text-slate-400 hover:text-rose-600 transition cursor-pointer ${
        disabled ? "opacity-30 cursor-not-allowed hover:text-slate-400" : ""
      }`}
      title={
        disabled
          ? "Tidak dapat dihapus karena masih ada karyawan pada level ini"
          : "Hapus job level"
      }
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}

// ==========================================
// 3. PERIODE KPI FORMS
// ==========================================

export function PeriodForm({
  action,
}: {
  action: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [evaluationDate, setEvaluationDate] = useState("");
  const [inputStartMonth, setInputStartMonth] = useState("11");
  const [cutoffMonth, setCutoffMonth] = useState("12");
  const [minTenureMonths, setMinTenureMonths] = useState("6");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Nama Periode Wajib Diisi",
        text: "Silakan masukkan nama periode KPI (contoh: KPI Tahun 2026).",
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("year", year);
    fd.append("evaluationDate", evaluationDate);
    fd.append("inputStartMonth", inputStartMonth);
    fd.append("cutoffMonth", cutoffMonth);
    fd.append("minTenureMonths", minTenureMonths);

    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Periode KPI Dibuat!",
          text: `Periode "${name}" berhasil ditambahkan ke sistem.`,
          confirmButtonColor: "#0284c7",
          timer: 1800,
          timerProgressBar: true,
        });
        setName("");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal membuat periode.";
        await Swal.fire({
          icon: "error",
          title: "Gagal Membuat Periode",
          text: msg,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-sm">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">
          Nama Periode <span className="text-rose-500">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Contoh: KPI Tahun 2026"
          required
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Tahun</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Tgl Penilaian</label>
          <input
            type="date"
            value={evaluationDate}
            onChange={(e) => setEvaluationDate(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Mulai Input (Bln)</label>
          <input
            type="number"
            value={inputStartMonth}
            onChange={(e) => setInputStartMonth(e.target.value)}
            min={1}
            max={12}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Cut-off (Bln)</label>
          <input
            type="number"
            value={cutoffMonth}
            onChange={(e) => setCutoffMonth(e.target.value)}
            min={1}
            max={12}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">
          Min. Masa Kerja (Bulan) untuk Eligible
        </label>
        <input
          type="number"
          value={minTenureMonths}
          onChange={(e) => setMinTenureMonths(e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="pt-2">
        <button type="submit" disabled={isPending} className={`${btnPrimary} w-full`}>
          {isPending ? "Membuat..." : "+ Buat Periode"}
        </button>
      </div>
    </form>
  );
}

export function PeriodStatusChanger({
  id,
  currentStatus,
  periodName,
  action,
}: {
  id: number;
  currentStatus: string;
  periodName: string;
  action: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [isPending, startTransition] = useTransition();

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("id", String(id));
    fd.append("status", status);

    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Status Diperbarui!",
          text: `Periode "${periodName}" sekarang berstatus ${status}.`,
          confirmButtonColor: "#0284c7",
          timer: 1500,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal mengubah status";
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
    <form onSubmit={handleUpdate} className="flex gap-1.5 items-center">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded border border-slate-300 px-2 py-1 text-xs font-medium bg-white"
      >
        <option value="DRAFT">DRAFT</option>
        <option value="ACTIVE">ACTIVE</option>
        <option value="CLOSED">CLOSED</option>
      </select>
      <button
        type="submit"
        disabled={isPending || status === currentStatus}
        className="text-xs text-sky-600 font-bold hover:underline cursor-pointer disabled:opacity-40"
      >
        {isPending ? "..." : "Simpan"}
      </button>
    </form>
  );
}

// ==========================================
// 4. CONFIGURATION FORMS
// ==========================================

export function ConfigClockForm({
  defaultDate,
  action,
}: {
  defaultDate: string;
  action: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultDate);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("key", "system_clock_date");
    fd.append("value", value);

    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "System Clock Disimpan!",
          text: value
            ? `Tanggal simulasi sistem diatur ke: ${value}`
            : "Tanggal sistem dikembalikan ke waktu aktual server.",
          confirmButtonColor: "#0284c7",
          timer: 1800,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan konfigurasi";
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
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={inputCls}
      />
      <button type="submit" disabled={isPending} className={btnPrimary}>
        {isPending ? "..." : "Simpan"}
      </button>
    </form>
  );
}

export function ConfigCompanyForm({
  action,
}: {
  action: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Nama Perusahaan Wajib Diisi",
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    const fd = new FormData();
    fd.append("key", "company_name");
    fd.append("value", value.trim());

    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Identitas Perusahaan Disimpan!",
          text: `Nama perusahaan diatur ke: ${value.trim()}`,
          confirmButtonColor: "#0284c7",
          timer: 1800,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan";
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
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Contoh: PT Kalimantan Prima Persada"
        className={inputCls}
      />
      <button type="submit" disabled={isPending} className={btnPrimary}>
        {isPending ? "..." : "Simpan"}
      </button>
    </form>
  );
}

export function ConfigKpiLimitForm({
  action,
  defaultLimit,
}: {
  action: (fd: FormData) => Promise<void>;
  defaultLimit: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultLimit);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(value);
    if (!value.trim() || isNaN(num) || num <= 0) {
      void Swal.fire({
        icon: "warning",
        title: "Input Tidak Valid",
        text: "Masukkan angka persentase yang lebih dari 0.",
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    const fd = new FormData();
    fd.append("key", "max_kpi_category_weight");
    fd.append("value", String(num));

    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
        await Swal.fire({
          icon: "success",
          title: "Batas Bobot KPI Disimpan!",
          text: `Total batas maksimal bobot KPI diatur ke: ${num}%`,
          confirmButtonColor: "#0284c7",
          timer: 1800,
          timerProgressBar: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan konfigurasi";
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
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <input
          type="number"
          min="1"
          max="200"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Contoh: 115"
          className={inputCls}
        />
        <span className="absolute right-3 top-2.5 text-sm font-medium text-slate-400">
          %
        </span>
      </div>
      <button type="submit" disabled={isPending} className={btnPrimary}>
        {isPending ? "..." : "Simpan"}
      </button>
    </form>
  );
}
