"use client";

import React, { useState, useTransition } from "react";
import Swal from "sweetalert2";
import type { Department, JobLevel } from "@/db/schema";
import { btnPrimary, inputCls } from "./ui";

export function CreateTemplateForm({
  departments,
  jobLevels,
  action,
}: {
  departments: Department[];
  jobLevels: JobLevel[];
  action: (fd: FormData) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState(String(departments[0]?.id ?? ""));
  const [jobLevelId, setJobLevelId] = useState(String(jobLevels[0]?.id ?? ""));
  const [totalWeight, setTotalWeight] = useState("1.15");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Nama Template Wajib Diisi",
        text: "Silakan masukkan nama template KPI.",
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
    fd.append("name", name.trim());
    fd.append("departmentId", departmentId);
    fd.append("jobLevelId", jobLevelId);
    fd.append("totalWeight", totalWeight);

    startTransition(async () => {
      try {
        await Swal.fire({
          icon: "info",
          title: "Menyimpan Template...",
          text: `Membuat template "${name.trim()}" dan menyiapkan parameter...`,
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
        const msg = err instanceof Error ? err.message : "Gagal membuat template";
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
    <form onSubmit={handleSubmit} className="space-y-3 text-sm">
      <label className="block">
        <span className="block font-medium text-slate-700 mb-1">
          Nama Template <span className="text-rose-500">*</span>
        </span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Contoh: Template Superintendent Logistik"
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="block font-medium text-slate-700 mb-1">Departemen</span>
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
      </label>
      <label className="block">
        <span className="block font-medium text-slate-700 mb-1">Job Level</span>
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
      </label>
      <label className="block">
        <span className="block font-medium text-slate-700 mb-1">
          Total Bobot (1.15 = 115%)
        </span>
        <input
          name="totalWeight"
          type="number"
          step="0.01"
          value={totalWeight}
          onChange={(e) => setTotalWeight(e.target.value)}
          className={inputCls}
        />
      </label>
      <button type="submit" disabled={isPending} className={`${btnPrimary} w-full`}>
        {isPending ? "Menyimpan Template..." : "+ Buat & Edit Parameter"}
      </button>
    </form>
  );
}
