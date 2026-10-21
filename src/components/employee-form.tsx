"use client";

import React, { useState, useEffect, useTransition } from "react";
import Swal from "sweetalert2";
import type { Department, Employee, JobLevel } from "@/db/schema";
import { btnAmber, inputCls, inputErrorCls } from "./ui";

export function EmployeeForm({
  departments,
  jobLevels,
  employees,
  action,
}: {
  departments: Department[];
  jobLevels: JobLevel[];
  employees: Employee[];
  action: (fd: FormData) => Promise<void>;
}) {
  const [nik, setNik] = useState("");
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState(String(departments[0]?.id ?? ""));
  const [jobLevelId, setJobLevelId] = useState(String(jobLevels[0]?.id ?? ""));
  const [operatingUnit, setOperatingUnit] = useState("HO");
  const [jobPosition, setJobPosition] = useState("");
  const [dateOfHire, setDateOfHire] = useState("");
  const [appraiserId, setAppraiserId] = useState("");
  const [headDeptId, setHeadDeptId] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  // 1. Cascading filter Head Department options strictly based on selected Department
  const headDeptOptions = React.useMemo(() => {
    const activeEmps = employees.filter((e) => e.isActive);

    if (!departmentId) return [];

    const deptEmps = activeEmps.filter(
      (e) => String(e.departmentId) === String(departmentId)
    );

    const deptHeadRoleMatch = deptEmps.filter(
      (e) => e.role === "HEAD_DEPT" || e.role === "ADMIN"
    );

    if (deptHeadRoleMatch.length > 0) return deptHeadRoleMatch;
    return deptEmps;
  }, [employees, departmentId]);

  // Auto-suggest matching Head Dept when department changes
  useEffect(() => {
    if (headDeptOptions.length > 0) {
      const bestHead = headDeptOptions.find((e) => e.role === "HEAD_DEPT") ?? headDeptOptions[0];
      if (bestHead && !headDeptId) {
        setHeadDeptId(String(bestHead.id));
      }
    }
  }, [departmentId, headDeptOptions, headDeptId]);

  // 2. Cascading filter Penilai options strictly based on selected Department
  const appraiserGroups = React.useMemo(() => {
    const activeEmps = employees.filter((e) => e.isActive);

    if (!departmentId) {
      return { sameDeptAndOu: [], sameDeptOnly: [] };
    }

    const sameDeptAndOu = activeEmps.filter(
      (e) =>
        String(e.departmentId) === String(departmentId) &&
        (e.operatingUnit || "HO").toUpperCase() === operatingUnit.toUpperCase()
    );

    const sameDeptOnly = activeEmps.filter(
      (e) =>
        String(e.departmentId) === String(departmentId) &&
        (e.operatingUnit || "HO").toUpperCase() !== operatingUnit.toUpperCase()
    );

    return { sameDeptAndOu, sameDeptOnly };
  }, [employees, departmentId, operatingUnit]);

  // Deteksi duplikasi NIK terhadap daftar karyawan yang sudah ada
  const findDuplicateEmployee = (nikToCheck: string) => {
    const clean = nikToCheck.trim().toLowerCase();
    if (!clean) return null;
    return (
      employees.find((e) => (e.nik || "").trim().toLowerCase() === clean) ?? null
    );
  };

  const handleNikChange = (value: string) => {
    setNik(value);
    const clean = value.trim();
    if (!clean) {
      if (errors.nik) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.nik;
          return next;
        });
      }
      return;
    }

    const dup = findDuplicateEmployee(clean);
    if (dup) {
      setErrors((prev) => ({
        ...prev,
        nik: `NIK sudah digunakan oleh ${dup.name} (${dup.isActive ? "Aktif" : "Non-aktif"})`,
      }));
    } else if (errors.nik) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.nik;
        return next;
      });
    }
  };

  const handleNikBlur = () => {
    const clean = nik.trim();
    if (!clean) return;
    const dup = findDuplicateEmployee(clean);
    if (dup) {
      setErrors((prev) => ({
        ...prev,
        nik: `NIK "${clean}" sudah terdaftar atas nama ${dup.name} (${dup.isActive ? "Aktif" : "Non-aktif"}). NIK tidak boleh duplikat.`,
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Nama lengkap wajib diisi!";

    const cleanNik = nik.trim();
    if (!cleanNik) {
      errs.nik = "NIK wajib diisi!";
    } else {
      const dup = findDuplicateEmployee(cleanNik);
      if (dup) {
        errs.nik = `NIK "${cleanNik}" sudah terdaftar atas nama ${dup.name} (${dup.isActive ? "Aktif" : "Non-aktif"}). NIK tidak boleh duplikat.`;
      }
    }

    if (!departmentId) errs.departmentId = "Departemen wajib dipilih!";
    if (!jobLevelId) errs.jobLevelId = "Job level wajib dipilih!";
    if (!operatingUnit) errs.operatingUnit = "Operating Unit wajib dipilih!";
    if (!jobPosition.trim()) errs.jobPosition = "Job Title (Jabatan) wajib diisi!";
    if (!dateOfHire) errs.dateOfHire = "Arrival Date / Tanggal Masuk wajib diisi!";

    setErrors(errs);

    if (Object.keys(errs).length > 0) {
      void Swal.fire({
        icon: "warning",
        title: errs.nik?.includes("sudah terdaftar") || errs.nik?.includes("sudah digunakan")
          ? "NIK Duplikat Terdeteksi"
          : "Field Belum Lengkap",
        text: Object.values(errs)[0],
        confirmButtonColor: "#f59e0b",
      });
      return;
    }

    const fd = new FormData();
    fd.append("nik", cleanNik);
    fd.append("name", name.trim());
    fd.append("departmentId", departmentId);
    fd.append("jobLevelId", jobLevelId);
    fd.append("operatingUnit", operatingUnit);
    fd.append("jobPosition", jobPosition.trim());
    fd.append("dateOfHire", dateOfHire);
    if (appraiserId) fd.append("appraiserId", appraiserId);
    if (headDeptId) fd.append("headDeptId", headDeptId);
    fd.append("isActive", "true");

    startTransition(async () => {
      try {
        await action(fd);
        await Swal.fire({
          icon: "success",
          title: "Karyawan Disimpan!",
          text: `Data karyawan ${name} (${cleanNik}) berhasil disimpan.`,
          confirmButtonColor: "#f59e0b",
          timer: 2000,
          timerProgressBar: true,
        });

        // Reset form
        setNik("");
        setName("");
        setJobPosition("");
        setDateOfHire("");
        setAppraiserId("");
        setHeadDeptId("");
        setErrors({});
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan karyawan.";
        if (msg.toLowerCase().includes("nik")) {
          setErrors((prev) => ({ ...prev, nik: msg }));
        }
        await Swal.fire({
          icon: "error",
          title: "Gagal",
          text: msg,
          confirmButtonColor: "#f59e0b",
        });
      }
    });
  };

  const selectedDeptName = departments.find((d) => String(d.id) === departmentId)?.name ?? "";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-800 border-b border-slate-100 pb-3 mb-4">
        Tambah Karyawan Manual
      </h2>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3.5 text-sm">
        {/* 1. NAMA LENGKAP */}
        <div>
          <label className="block font-medium text-slate-700">
            Nama Lengkap <span className="text-rose-500">*</span>
          </label>
          <input
            name="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
            }}
            placeholder="Contoh: Budi Santoso"
            className={errors.name ? inputErrorCls : inputCls}
          />
          {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name}</p>}
        </div>

        {/* 2. NIK */}
        <div>
          <label className="block font-medium text-slate-700">
            NIK <span className="text-rose-500">*</span>
          </label>
          <input
            name="nik"
            value={nik}
            onChange={(e) => handleNikChange(e.target.value)}
            onBlur={handleNikBlur}
            placeholder="Contoh: 20001"
            className={errors.nik ? inputErrorCls : inputCls}
          />
          {errors.nik && <p className="mt-1 text-xs text-rose-600 font-medium">{errors.nik}</p>}
        </div>

        {/* 3. OPERATING UNIT */}
        <div>
          <label className="block font-medium text-slate-700">
            Operating Unit <span className="text-rose-500">*</span>
          </label>
          <select
            name="operatingUnit"
            value={operatingUnit}
            onChange={(e) => setOperatingUnit(e.target.value)}
            className={inputCls}
          >
            <option value="HO">HO (Head Office Samarinda)</option>
            <option value="GAM">GAM (Site GAM - PT Ganda Alam Makmur)</option>
            <option value="AKP">AKP (Site AKP - PT Adhi Kartiko Pratama)</option>
          </select>
        </div>

        {/* 4. DEPARTEMEN */}
        <div>
          <label className="block font-medium text-slate-700">
            Departemen <span className="text-rose-500">*</span>
          </label>
          <select
            name="departmentId"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className={inputCls}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>
        </div>

        {/* 5. JOB LEVEL */}
        <div>
          <label className="block font-medium text-slate-700">
            Job Level <span className="text-rose-500">*</span>
          </label>
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
        </div>

        {/* 6. JOB TITLE */}
        <div>
          <label className="block font-medium text-slate-700">
            Job Title (Jabatan) <span className="text-rose-500">*</span>
          </label>
          <input
            name="jobPosition"
            value={jobPosition}
            onChange={(e) => {
              setJobPosition(e.target.value);
              if (errors.jobPosition) setErrors((prev) => ({ ...prev, jobPosition: "" }));
            }}
            placeholder="Contoh: Supervisor Logistik"
            className={errors.jobPosition ? inputErrorCls : inputCls}
          />
          {errors.jobPosition && <p className="mt-1 text-xs text-rose-600">{errors.jobPosition}</p>}
        </div>

        {/* 7. ARRIVAL DATE */}
        <div>
          <label className="block font-medium text-slate-700">
            Arrival Date (Tgl Masuk) <span className="text-rose-500">*</span>
          </label>
          <input
            type="date"
            name="dateOfHire"
            value={dateOfHire}
            onChange={(e) => {
              setDateOfHire(e.target.value);
              if (errors.dateOfHire) setErrors((prev) => ({ ...prev, dateOfHire: "" }));
            }}
            className={errors.dateOfHire ? inputErrorCls : inputCls}
          />
          {errors.dateOfHire && <p className="mt-1 text-xs text-rose-600">{errors.dateOfHire}</p>}
        </div>

        {/* 8. PENILAI (ATASAN) */}
        <div>
          <label className="block font-medium text-slate-700">Penilai (Atasan)</label>
          <select
            name="appraiserId"
            value={appraiserId}
            onChange={(e) => setAppraiserId(e.target.value)}
            className={inputCls}
          >
            <option value="">- Belum ditentukan -</option>

            {!departmentId && (
              <option value="" disabled>(Pilih departemen terlebih dahulu)</option>
            )}

            {departmentId && appraiserGroups.sameDeptAndOu.length > 0 && (
              <optgroup label={`— Karyawan ${selectedDeptName} (${operatingUnit}) —`}>
                {appraiserGroups.sameDeptAndOu.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.operatingUnit || "HO"}) · {e.jobPosition}
                  </option>
                ))}
              </optgroup>
            )}

            {departmentId && appraiserGroups.sameDeptOnly.length > 0 && (
              <optgroup label={`— Karyawan ${selectedDeptName} (Site/Unit Lain) —`}>
                {appraiserGroups.sameDeptOnly.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.operatingUnit || "HO"}) · {e.jobPosition}
                  </option>
                ))}
              </optgroup>
            )}

            {departmentId && appraiserGroups.sameDeptAndOu.length === 0 && appraiserGroups.sameDeptOnly.length === 0 && (
              <option value="" disabled>
                (Belum ada karyawan lain di Departemen {selectedDeptName})
              </option>
            )}
          </select>
        </div>

        {/* 9. HEAD DEPARTMENT */}
        <div className="col-span-2">
          <label className="block font-medium text-slate-700">Head Department</label>
          <select
            name="headDeptId"
            value={headDeptId}
            onChange={(e) => setHeadDeptId(e.target.value)}
            className={inputCls}
          >
            <option value="">- Belum ditentukan -</option>

            {!departmentId && (
              <option value="" disabled>(Pilih departemen terlebih dahulu)</option>
            )}

            {departmentId && headDeptOptions.length > 0 ? (
              <optgroup label={`— Head Dept / Penilai ${selectedDeptName} —`}>
                {headDeptOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.operatingUnit || "HO"}) · {e.jobPosition}
                  </option>
                ))}
              </optgroup>
            ) : (
              departmentId && (
                <option value="" disabled>
                  (Belum ada Head Dept di Departemen {selectedDeptName})
                </option>
              )
            )}
          </select>
        </div>

        {/* Tombol Simpan - Oren / Amber */}
        <div className="col-span-2 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className={`${btnAmber} w-full`}
          >
            {isPending ? (
              <>
                <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Menyimpan Karyawan...</span>
              </>
            ) : (
              <>
                <span>💾 Simpan Karyawan</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
