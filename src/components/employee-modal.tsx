"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import type { Department, Employee, JobLevel, JobPosition, Pit, DepartmentMapping } from "@/db/schema";
import type { DepartmentMappingWithDetails } from "@/lib/department-mapping-utils";
import { matchesSite, matchesDeptName } from "@/lib/department-mapping-utils";
import { btnSecondary, inputCls, inputErrorCls } from "./ui";
import { UserPlus, Save } from "lucide-react";

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  jobLevels: JobLevel[];
  jobPositions?: JobPosition[];
  employees?: Employee[];
  pits?: Pit[];
  mappings?: (DepartmentMapping | DepartmentMappingWithDetails)[];
  action: (fd: FormData) => Promise<void>;
  initialEmployee?: Employee | null;
}

export function EmployeeModal({
  isOpen,
  onClose,
  departments,
  jobLevels,
  jobPositions = [],
  employees = [],
  pits = [],
  mappings = [],
  action,
  initialEmployee,
}: EmployeeModalProps) {
  const router = useRouter();
  const [nik, setNik] = useState("");
  const [name, setName] = useState("");
  const [operatingUnit, setOperatingUnit] = useState("HO");
  const [departmentId, setDepartmentId] = useState("");
  const [pitId, setPitId] = useState("");
  const [jobPosition, setJobPosition] = useState("");
  const [jobPositionId, setJobPositionId] = useState("");
  const [jobLevelId, setJobLevelId] = useState("");
  const [dateOfHire, setDateOfHire] = useState("");
  const [polaPenggajian, setPolaPenggajian] = useState("All In");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  // Load initial data if editing, or reset if adding
  useEffect(() => {
    if (initialEmployee) {
      setNik(initialEmployee.nik || "");
      setName(initialEmployee.name || "");
      const op = initialEmployee.operatingUnit || "HO";
      setOperatingUnit(op);
      const depId = initialEmployee.departmentId ? String(initialEmployee.departmentId) : "";
      setDepartmentId(depId);

      let initialPit = initialEmployee.pitId ? String(initialEmployee.pitId) : "";
      if (!initialPit && mappings && mappings.length > 0) {
        const rawDept = (initialEmployee.originalDepartment || "").trim();
        const site = op.toUpperCase();
        if (rawDept) {
          const m = mappings.find(
            (map) =>
              matchesSite(map.site, site) &&
              map.pitId &&
              (matchesDeptName(map.cleanRawName, rawDept) || matchesDeptName(map.rawDepartmentName, rawDept))
          );
          if (m?.pitId) initialPit = String(m.pitId);
        }
        if (!initialPit && depId) {
          const m = mappings.find(
            (map) => matchesSite(map.site, site) && map.departmentId === Number(depId) && map.pitId
          );
          if (m?.pitId) initialPit = String(m.pitId);
        }
      }
      setPitId(initialPit);

      setJobPosition(initialEmployee.jobPosition || "");
      setJobPositionId(initialEmployee.jobPositionId ? String(initialEmployee.jobPositionId) : "");
      setJobLevelId(initialEmployee.jobLevelId ? String(initialEmployee.jobLevelId) : "");
      setDateOfHire(initialEmployee.dateOfHire ? String(initialEmployee.dateOfHire).slice(0, 10) : "");
      setPolaPenggajian(initialEmployee.polaPenggajian || "All In");
    } else {
      setNik("");
      setName("");
      setOperatingUnit("HO");
      const defaultDeptId = departments[0]?.id ? String(departments[0].id) : "";
      setDepartmentId(defaultDeptId);
      setPitId("");
      setJobPosition("");
      setJobPositionId("");
      setJobLevelId("");
      setDateOfHire("");
      setPolaPenggajian("All In");
    }
    setErrors({});
  }, [initialEmployee, isOpen, departments, mappings]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isPending]);

  // Cascading filter for Job Positions based on selected Department
  const deptPositions = React.useMemo(() => {
    if (!jobPositions || jobPositions.length === 0) return [];
    const deptIdNum = Number(departmentId);
    return jobPositions
      .filter((p) => p.isActive !== false && (!deptIdNum || p.departmentId === deptIdNum))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [jobPositions, departmentId]);

  // Filter matching job level label for display
  const currentJobLevel = React.useMemo(() => {
    if (!jobLevelId) return null;
    return jobLevels.find((l) => String(l.id) === String(jobLevelId)) ?? null;
  }, [jobLevels, jobLevelId]);

  // Filter PITs based on selected Site (operatingUnit)
  const availablePits = React.useMemo(() => {
    if (!pits || pits.length === 0) return [];
    const active = pits.filter((p) => p.isActive !== false);
    if (!operatingUnit || operatingUnit === "ALL") return active;
    const sitePits = active.filter(
      (p) => (p.site || "").toUpperCase() === operatingUnit.toUpperCase()
    );
    return sitePits.length > 0 ? sitePits : active;
  }, [pits, operatingUnit]);

  if (!isOpen) return null;

  const handlePositionChange = (posName: string) => {
    setJobPosition(posName);
    if (errors.jobPosition) setErrors((prev) => ({ ...prev, jobPosition: "" }));

    const matched = jobPositions.find((p) => p.name === posName);
    if (matched) {
      setJobPositionId(String(matched.id));
      if (matched.jobLevelId) {
        setJobLevelId(String(matched.jobLevelId));
        if (errors.jobLevelId) setErrors((prev) => ({ ...prev, jobLevelId: "" }));
      }
      if (matched.departmentId && String(matched.departmentId) !== departmentId) {
        setDepartmentId(String(matched.departmentId));
        if (errors.departmentId) setErrors((prev) => ({ ...prev, departmentId: "" }));
      }
    } else {
      setJobPositionId("");
      setJobLevelId("");
    }
  };

  const handleDepartmentChange = (newDeptId: string) => {
    setDepartmentId(newDeptId);
    if (errors.departmentId) setErrors((prev) => ({ ...prev, departmentId: "" }));

    // Reset position & level if current position doesn't belong to the new department
    if (jobPosition) {
      const posInNewDept = jobPositions.find(
        (p) => String(p.departmentId) === String(newDeptId) && p.name === jobPosition
      );
      if (!posInNewDept) {
        setJobPosition("");
        setJobPositionId("");
        setJobLevelId("");
      }
    }

    // Auto-suggest PIT dari mapping departemen jika ada
    if (mappings && pits && mappings.length > 0) {
      const site = (operatingUnit || "HO").toUpperCase();
      const deptNum = Number(newDeptId);
      const matchedMap = mappings.find(
        (m) => matchesSite(m.site, site) && m.departmentId === deptNum && m.pitId
      );
      if (matchedMap?.pitId) {
        setPitId(String(matchedMap.pitId));
      }
    }
  };

  // Deteksi duplikasi NIK terhadap daftar karyawan (mengabaikan karyawan yang sedang diedit)
  const findDuplicateEmployee = (nikToCheck: string) => {
    const clean = nikToCheck.trim().toLowerCase();
    if (!clean) return null;
    return (
      employees.find((e) => {
        if (initialEmployee && e.id === initialEmployee.id) return false;
        return (e.nik || "").trim().toLowerCase() === clean;
      }) ?? null
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
    const cleanNik = nik.trim();
    if (!cleanNik) {
      errs.nik = "NIK wajib diisi";
    } else {
      const dup = findDuplicateEmployee(cleanNik);
      if (dup) {
        errs.nik = `NIK "${cleanNik}" sudah terdaftar atas nama ${dup.name} (${dup.isActive ? "Aktif" : "Non-aktif"}). NIK tidak boleh duplikat.`;
      }
    }

    if (!name.trim()) errs.name = "Nama lengkap wajib diisi";
    if (!operatingUnit) errs.operatingUnit = "Operating Unit wajib dipilih";
    if (!departmentId) errs.departmentId = "Departemen wajib dipilih";
    if (!jobPosition.trim()) errs.jobPosition = "Jabatan wajib dipilih";
    if (!jobLevelId) errs.jobLevelId = "Job level belum terdefinisi untuk jabatan ini";
    if (!dateOfHire) errs.dateOfHire = "Tanggal Masuk wajib diisi";
    if (!polaPenggajian) errs.polaPenggajian = "Pola Penggajian wajib dipilih";

    setErrors(errs);

    if (Object.keys(errs).length > 0) {
      void Swal.fire({
        icon: "warning",
        title: errs.nik?.includes("sudah terdaftar") || errs.nik?.includes("sudah digunakan")
          ? "NIK Duplikat Terdeteksi"
          : "Data Belum Lengkap",
        text: Object.values(errs)[0],
        confirmButtonColor: "#0284c7",
      });
      return;
    }

    const fd = new FormData();
    if (initialEmployee?.id) {
      fd.append("id", String(initialEmployee.id));
    }
    fd.append("nik", cleanNik);
    fd.append("name", name.trim());
    fd.append("operatingUnit", operatingUnit);
    fd.append("departmentId", departmentId);
    if (pitId) fd.append("pitId", pitId);
    if (jobPositionId) fd.append("jobPositionId", jobPositionId);
    fd.append("jobPosition", jobPosition.trim());
    fd.append("jobLevelId", jobLevelId);
    fd.append("dateOfHire", dateOfHire);
    fd.append("polaPenggajian", polaPenggajian);
    fd.append("role", initialEmployee?.role || "KARYAWAN");
    fd.append("password", initialEmployee?.password || cleanNik);
    if (initialEmployee?.appraiserId) fd.append("appraiserId", String(initialEmployee.appraiserId));
    if (initialEmployee?.headDeptId) fd.append("headDeptId", String(initialEmployee.headDeptId));
    if (initialEmployee?.managerId) fd.append("managerId", String(initialEmployee.managerId));
    fd.append("isActive", "true");

    startTransition(async () => {
      try {
        await action(fd);
        await Swal.fire({
          icon: "success",
          title: initialEmployee ? "Data Karyawan Diperbarui" : "Karyawan Ditambahkan",
          text: `${name.trim()} (${cleanNik}) berhasil disimpan.`,
          confirmButtonColor: "#0284c7",
          timer: 1500,
          timerProgressBar: true,
        });

        onClose();
        router.push("/setup/master?tab=karyawan");
        router.refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan data karyawan.";
        if (msg.toLowerCase().includes("nik")) {
          setErrors((prev) => ({ ...prev, nik: msg }));
        }
        await Swal.fire({
          icon: "error",
          title: "Gagal Menyimpan",
          text: msg,
          confirmButtonColor: "#e11d48",
        });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white shadow-xs">
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {initialEmployee ? "Edit Data Karyawan" : "Tambah Karyawan Manual"}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 1. NIK */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                NIK <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="nik"
                value={nik}
                onChange={(e) => handleNikChange(e.target.value)}
                onBlur={handleNikBlur}
                placeholder="Contoh: 1.1025.273"
                className={errors.nik ? inputErrorCls : inputCls}
              />
              {errors.nik && <p className="mt-1 text-[11px] text-rose-600 font-medium">{errors.nik}</p>}
            </div>

            {/* 2. NAMA LENGKAP */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Nama Lengkap <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
                }}
                placeholder="Nama lengkap karyawan"
                className={errors.name ? inputErrorCls : inputCls}
              />
              {errors.name && <p className="mt-1 text-[11px] text-rose-600">{errors.name}</p>}
            </div>

            {/* 3. OPERATING UNIT */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Site <span className="text-rose-500">*</span>
              </label>
              <select
                name="operatingUnit"
                value={operatingUnit}
                onChange={(e) => {
                  const newSite = e.target.value;
                  setOperatingUnit(newSite);
                  if (newSite === "HO") {
                    setPitId("");
                  } else if (mappings && pits && departmentId) {
                    const deptNum = Number(departmentId);
                    const matchedMap = mappings.find(
                      (m) => matchesSite(m.site, newSite) && m.departmentId === deptNum && m.pitId
                    );
                    if (matchedMap?.pitId) {
                      setPitId(String(matchedMap.pitId));
                    }
                  }
                }}
                className={inputCls}
              >
                <option value="HO">HO</option>
                <option value="GAM">GAM</option>
                <option value="AKP">AKP</option>
              </select>
            </div>

            {/* 4. DEPARTEMEN */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Departemen <span className="text-rose-500">*</span>
              </label>
              <select
                name="departmentId"
                value={departmentId}
                onChange={(e) => handleDepartmentChange(e.target.value)}
                className={errors.departmentId ? inputErrorCls : inputCls}
              >
                <option value="">Pilih Departemen</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
              {errors.departmentId && (
                <p className="mt-1 text-[11px] text-rose-600">{errors.departmentId}</p>
              )}
            </div>

            {/* 4b. PIT (OPSIONAL) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-medium text-slate-700">
                  PIT <span className="text-slate-400 font-normal text-xs">(Opsional)</span>
                </label>
                {pitId && (
                  <button
                    type="button"
                    onClick={() => setPitId("")}
                    className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                  >
                    Kosongkan PIT
                  </button>
                )}
              </div>
              <select
                name="pitId"
                value={pitId}
                onChange={(e) => setPitId(e.target.value)}
                className={inputCls}
              >
                <option value="">- Tanpa PIT (Karyawan HO / Non-PIT) -</option>
                {availablePits.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 5. JABATAN */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Jabatan <span className="text-rose-500">*</span>
              </label>
              {deptPositions.length > 0 ? (
                <select
                  name="jobPosition"
                  value={jobPosition}
                  onChange={(e) => handlePositionChange(e.target.value)}
                  className={errors.jobPosition ? inputErrorCls : inputCls}
                >
                  <option value="">Pilih Jabatan</option>
                  {deptPositions.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name} {p.code ? `(${p.code})` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  name="jobPosition"
                  value={jobPosition}
                  onChange={(e) => handlePositionChange(e.target.value)}
                  placeholder="Ketik nama jabatan"
                  className={errors.jobPosition ? inputErrorCls : inputCls}
                />
              )}
              {errors.jobPosition && (
                <p className="mt-1 text-[11px] text-rose-600">{errors.jobPosition}</p>
              )}
            </div>

            {/* 6. JOB LEVEL (READ-ONLY, OTOMATIS MENGIKUTI JABATAN) */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Job Level <span className="text-slate-400 font-normal">(Otomatis)</span>
              </label>
              <input
                type="text"
                readOnly
                tabIndex={-1}
                value={
                  currentJobLevel
                    ? `${currentJobLevel.name} (${currentJobLevel.code})`
                    : "Mengikuti pilihan jabatan"
                }
                className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 cursor-not-allowed select-none"
              />
              <input type="hidden" name="jobLevelId" value={jobLevelId} />
              {errors.jobLevelId && (
                <p className="mt-1 text-[11px] text-rose-600">{errors.jobLevelId}</p>
              )}
            </div>

            {/* 7. TANGGAL MASUK */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Tanggal Masuk <span className="text-rose-500">*</span>
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
              {errors.dateOfHire && (
                <p className="mt-1 text-[11px] text-rose-600">{errors.dateOfHire}</p>
              )}
            </div>

            {/* 8. POLA PENGGAJIAN */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Pola Penggajian <span className="text-rose-500">*</span>
              </label>
              <select
                name="polaPenggajian"
                value={polaPenggajian}
                onChange={(e) => setPolaPenggajian(e.target.value)}
                className={inputCls}
              >
                <option value="All In">All In</option>
                <option value="OT">OT</option>
              </select>
            </div>
          </div>

          {/* Footer Modal */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className={btnSecondary}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 active:scale-95 transition disabled:opacity-50 cursor-pointer"
            >
              {isPending ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{initialEmployee ? "Simpan Perubahan" : "Simpan Karyawan"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
