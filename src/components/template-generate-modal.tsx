"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Swal from "sweetalert2";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Search,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  Plus,
  BookOpen,
} from "lucide-react";
import { createMasterParameterFromImportAction } from "@/lib/actions";
import type {
  Department,
  JobCategory,
  JobLevel,
  KpiBand,
  KpiCategory,
  KpiParameter,
  KpiPeriod,
  KpiTemplate,
} from "@/db/schema";
import { TemplateViewModal } from "./template-view-modal";
import type {
  GenerateTemplatePreviewData,
  GeneratePreviewCategory,
  GeneratePreviewParameter,
  GeneratePreviewBand,
  EmployeeGenerateResult,
  CategoryGeneratePayloadItem,
} from "@/lib/template-generate-actions";

interface TemplateGenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  departments: Department[];
  jobCategories: JobCategory[];
  jobPositionMappings?: Array<{ departmentId: number; jobCategoryId: number | null }>;
  periods: KpiPeriod[];
  activePeriod?: KpiPeriod;
  defaultDepartmentId?: string;
}

const SATUAN_OPTIONS = [
  "%",
  "Hari",
  "Jam",
  "Kali/Hari",
  "Kali",
  "Rp",
  "Rp/Bcm",
  "Bcm/Jam",
  "Ltr/Bcm",
  "Orang",
  "Kasus",
  "Case",
  "Dokumen",
  "Unit",
  "Tanggal",
  "X",
  "Hasil Survey",
  "-",
];

function cloneCategories(cats: GeneratePreviewCategory[]): GeneratePreviewCategory[] {
  return cats.map((c) => ({
    ...c,
    parameters: c.parameters.map((p) => ({
      ...p,
      scoringRules: p.scoringRules.map((b) => ({ ...b })),
    })),
  }));
}

export function TemplateGenerateModal({
  isOpen,
  onClose,
  onSuccess,
  departments,
  jobCategories,
  jobPositionMappings = [],
  periods,
  activePeriod,
  defaultDepartmentId,
}: TemplateGenerateModalProps) {
  const router = useRouter();

  // Tahapan: 1 = Pilih Dept, Job Category & Karyawan | 2 = Susun 5 Parameter | 3 = Review & Simpan
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Filter pemilihan kombinasi
  const [departmentId, setDepartmentId] = useState<string>(defaultDepartmentId || "");
  const [jobCategoryId, setJobCategoryId] = useState<string>("");
  const [periodId, setPeriodId] = useState<string>(
    activePeriod ? String(activePeriod.id) : periods[0] ? String(periods[0].id) : ""
  );

  // Loading & Error states
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generatingEmpId, setGeneratingEmpId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Data Preview dari Server
  const [previewData, setPreviewData] = useState<GenerateTemplatePreviewData | null>(null);

  // State Tahap 1: Karyawan terpilih
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<number>>(new Set());
  const [empSearch, setEmpSearch] = useState("");

  // Pilihan fleksibel "Template Atas Nama Karyawan" ("ALL" atau ID karyawan tertentu)
  const [activeEmployeeTarget, setActiveEmployeeTarget] = useState<string>("ALL");

  // State Tahap 2: Default 5 Parameter Utama + Custom Override per Karyawan
  const [categoriesState, setCategoriesState] = useState<GeneratePreviewCategory[]>([]);
  const [employeeCategoriesMap, setEmployeeCategoriesMap] = useState<
    Record<number, GeneratePreviewCategory[]>
  >({});

  // State Sub-Modal Edit (di kolom Aksi)
  const [editModalState, setEditModalState] = useState<{
    catIdx: number;
    paramId: number;
    activeTab: "EDIT_ITEM" | "MANAGE_SUBS";
  } | null>(null);
  const [editModalSearch, setEditModalSearch] = useState("");
  const [isAddingToDictionary, setIsAddingToDictionary] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  // State Sub-Modal Kriteria Penilaian
  const [criteriaModalTarget, setCriteriaModalTarget] = useState<{
    catIdx: number;
    paramId: number;
  } | null>(null);

  // State Tahap 3: Validasi Duplikasi, Modal View Template & Status Eksekusi per Karyawan
  const [duplicateHandling, setDuplicateHandling] = useState<"UPDATE_EXISTING" | "SKIP_EXISTING">(
    "UPDATE_EXISTING"
  );
  const [viewingEmployeeId, setViewingEmployeeId] = useState<number | null>(null);
  const [employeeResultsMap, setEmployeeResultsMap] = useState<
    Record<number, EmployeeGenerateResult>
  >({});

  // Sinkronisasi default saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      if (defaultDepartmentId && defaultDepartmentId !== "ALL" && defaultDepartmentId !== "GENERAL") {
        setDepartmentId(defaultDepartmentId);
      }
      if (activePeriod) {
        setPeriodId(String(activePeriod.id));
      }
    }
  }, [isOpen, defaultDepartmentId, activePeriod]);

  // Filter Job Category secara dinamis sesuai Departemen yang dipilih
  const availableJobCategories = useMemo(() => {
    if (!departmentId) return [];
    const deptIdNum = Number(departmentId);
    const validCatIds = new Set<number>();
    for (const m of jobPositionMappings) {
      if (m.departmentId === deptIdNum && m.jobCategoryId !== null) {
        validCatIds.add(m.jobCategoryId);
      }
    }
    return jobCategories.filter((c) => validCatIds.has(c.id));
  }, [departmentId, jobCategories, jobPositionMappings]);

  // Reset jobCategoryId jika tidak tersedia pada departemen yang baru dipilih
  useEffect(() => {
    if (jobCategoryId) {
      const stillValid = availableJobCategories.some((c) => String(c.id) === jobCategoryId);
      if (!stillValid) {
        setJobCategoryId("");
        setPreviewData(null);
      }
    }
  }, [departmentId, availableJobCategories, jobCategoryId]);

  // Otomatis muat data karyawan dan kamus parameter ketika Departemen + Job Category dipilih
  useEffect(() => {
    if (!isOpen || !departmentId || !jobCategoryId) {
      return;
    }

    let isCancelled = false;
    const fetchPreview = async () => {
      setIsLoadingPreview(true);
      setErrorMsg(null);
      try {
        const qs = new URLSearchParams({
          departmentId: String(departmentId),
          jobCategoryId: String(jobCategoryId),
        });
        if (periodId) qs.set("periodId", String(periodId));

        const httpRes = await fetch(`/api/admin/template-generate?${qs.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        const res = (await httpRes.json()) as {
          success: boolean;
          data?: GenerateTemplatePreviewData;
          error?: string;
        };

        if (isCancelled) return;

        if (!res.success || !res.data) {
          setErrorMsg(res.error || "Gagal memuat data mapping dan kamus parameter.");
          setPreviewData(null);
          return;
        }

        const data = res.data;
        setPreviewData(data);
        // Hanya pilih karyawan yang belum memiliki template / KPI aktif
        const availableEmps = data.employees.filter((e) => !e.hasExistingKpi);
        setSelectedEmpIds(new Set(availableEmps.map((e) => e.id)));
        setActiveEmployeeTarget(
          availableEmps.length === 1
            ? String(availableEmps[0].id)
            : availableEmps.length > 0
            ? "ALL"
            : data.employees.length > 0
            ? String(data.employees[0].id)
            : "ALL"
        );
        setCategoriesState(data.categories);
        setEmployeeCategoriesMap({});
        setEmployeeResultsMap({});
      } catch (err: unknown) {
        if (!isCancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingPreview(false);
        }
      }
    };

    void fetchPreview();
    return () => {
      isCancelled = true;
    };
  }, [isOpen, departmentId, jobCategoryId, periodId]);

  // Ambil daftar kategori aktif sesuai pilihan "Template Atas Nama Karyawan"
  const activeCategories = useMemo(() => {
    if (activeEmployeeTarget !== "ALL") {
      const empIdNum = Number(activeEmployeeTarget);
      if (employeeCategoriesMap[empIdNum]) {
        return employeeCategoriesMap[empIdNum];
      }
    }
    return categoriesState;
  }, [activeEmployeeTarget, employeeCategoriesMap, categoriesState]);

  // Helper mutasi kategori yang otomatis mengarah ke karyawan terpilih atau ke semua karyawan
  const mutateActiveCategories = (
    updater: (prev: GeneratePreviewCategory[]) => GeneratePreviewCategory[]
  ) => {
    if (activeEmployeeTarget !== "ALL") {
      const empIdNum = Number(activeEmployeeTarget);
      setEmployeeCategoriesMap((prevMap) => {
        const baseForEmp = prevMap[empIdNum]
          ? cloneCategories(prevMap[empIdNum])
          : cloneCategories(categoriesState);
        return {
          ...prevMap,
          [empIdNum]: updater(baseForEmp),
        };
      });
    } else {
      setCategoriesState((prev) => updater(prev));
    }
  };

  // Salin konfigurasi karyawan saat ini ke seluruh karyawan terpilih
  const applyCurrentToAllEmployees = () => {
    if (activeEmployeeTarget === "ALL") return;
    const empIdNum = Number(activeEmployeeTarget);
    const customCats = employeeCategoriesMap[empIdNum];
    if (customCats) {
      setCategoriesState(cloneCategories(customCats));
    }
    setEmployeeCategoriesMap({});
    setActiveEmployeeTarget("ALL");
  };

  const handleClose = () => {
    if (isLoadingPreview || isGeneratingAll || generatingEmpId !== null) return;
    const hadResults = Object.keys(employeeResultsMap).length > 0;
    setStep(1);
    setErrorMsg(null);
    setPreviewData(null);
    setEmpSearch("");
    setEditModalState(null);
    setCriteriaModalTarget(null);
    setViewingEmployeeId(null);
    setEmployeeResultsMap({});
    onClose();
    if (hadResults) {
      onSuccess?.();
      window.location.reload();
    }
  };

  // Filter daftar karyawan di Tahap 1
  const filteredEmployees = useMemo(() => {
    if (!previewData) return [];
    const q = empSearch.toLowerCase().trim();
    if (!q) return previewData.employees;
    return previewData.employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.nik.toLowerCase().includes(q) ||
        e.jobPositionName.toLowerCase().includes(q)
    );
  }, [previewData, empSearch]);

  // Daftar objek karyawan yang dicentang
  const selectedEmployeesList = useMemo(() => {
    if (!previewData) return [];
    return previewData.employees.filter((e) => selectedEmpIds.has(e.id));
  }, [previewData, selectedEmpIds]);

  // Objek karyawan yang sedang dipilih pada dropdown "Template Atas Nama"
  const currentTargetEmployeeObj = useMemo(() => {
    if (!previewData || activeEmployeeTarget === "ALL") return null;
    return previewData.employees.find((e) => String(e.id) === activeEmployeeTarget) || null;
  }, [previewData, activeEmployeeTarget]);

  // Jika user memilih karyawan spesifik di dropdown atas, pastikan karyawan tersebut ikut terpilih
  const handleSelectActiveEmployeeTarget = (val: string) => {
    setActiveEmployeeTarget(val);
    if (val !== "ALL") {
      const empId = Number(val);
      setSelectedEmpIds((prev) => {
        if (prev.has(empId)) return prev;
        const next = new Set(prev);
        next.add(empId);
        return next;
      });
    }
  };

  // Kalkulasi total bobot 5 Parameter Utama dan jumlah indikator terpilih
  const { totalCategoryWeight, totalEnabledParamsCount } = useMemo(() => {
    let catWeightSum = 0;
    let paramCount = 0;
    for (const c of activeCategories) {
      const enabledInCat = c.parameters.filter((p) => p.isEnabled);
      if (enabledInCat.length > 0) {
        catWeightSum += Number(c.categoryWeight) || 0;
        paramCount += enabledInCat.length;
      }
    }
    return {
      totalCategoryWeight: Math.round(catWeightSum * 10) / 10,
      totalEnabledParamsCount: paramCount,
    };
  }, [activeCategories]);

  // Toggle pilih karyawan (hanya yang belum memiliki KPI / template)
  const toggleEmployee = (id: number) => {
    if (!previewData) return;
    const emp = previewData.employees.find((e) => e.id === id);
    if (emp?.hasExistingKpi) return;

    setSelectedEmpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllEmployees = () => {
    if (!previewData) return;
    const availableEmps = previewData.employees.filter((e) => !e.hasExistingKpi);
    if (availableEmps.length === 0) return;

    if (selectedEmpIds.size === availableEmps.length) {
      setSelectedEmpIds(new Set());
    } else {
      setSelectedEmpIds(new Set(availableEmps.map((e) => e.id)));
    }
  };

  // Handler modifikasi Parameter & Indikator di Tahap 2
  const updateCategoryWeight = (catIdx: number, weight: number) => {
    mutateActiveCategories((prev) =>
      prev.map((c, idx) => (idx === catIdx ? { ...c, categoryWeight: weight } : c))
    );
  };

  // Ubah Nama Parameter Utama atau Mode Sub-Indikator (Untuk case Parameter 1 bukan Target Kerja)
  const updateCategoryMeta = (
    catIdx: number,
    updates: Partial<
      Pick<GeneratePreviewCategory, "categoryName" | "hasSubIndicators" | "categoryType">
    >
  ) => {
    mutateActiveCategories((prev) =>
      prev.map((c, idx) => {
        if (idx !== catIdx) return c;
        const nextCat = { ...c, ...updates };
        if (updates.hasSubIndicators === false) {
          // Jika diubah menjadi penilaian langsung (bukan sub-indikator), pastikan hanya 1 indikator aktif dengan bobot 100%
          const firstEnabled = nextCat.parameters.find((p) => p.isEnabled) || nextCat.parameters[0];
          nextCat.categoryType = "DIRECT";
          nextCat.parameters = nextCat.parameters.map((p) => ({
            ...p,
            isEnabled: firstEnabled ? p.id === firstEnabled.id : false,
            weight: firstEnabled && p.id === firstEnabled.id ? 100 : 0,
          }));
        } else if (updates.hasSubIndicators === true) {
          nextCat.categoryType = "SUB_ITEMS";
        }
        return nextCat;
      })
    );
  };

  // Ganti 1 baris indikator dengan indikator lain dari Kamus Parameter KPI
  const replaceSingleIndicatorFromMaster = (
    catIdx: number,
    oldParamId: number,
    newMasterParamId: number
  ) => {
    if (!previewData) return;
    const masterItem = previewData.allMasterParameters.find((m) => m.id === newMasterParamId);
    if (!masterItem) return;

    mutateActiveCategories((prev) =>
      prev.map((c, idx) => {
        if (idx !== catIdx) return c;

        const oldParam = c.parameters.find((p) => p.id === oldParamId);
        const preservedWeight = c.hasSubIndicators ? oldParam?.weight || 20 : 100;

        // Cek apakah masterItem sudah ada di dalam c.parameters
        const existsInCat = c.parameters.some((p) => p.id === masterItem.id);

        let nextParams: GeneratePreviewParameter[];
        if (existsInCat) {
          nextParams = c.parameters.map((p) => {
            if (p.id === masterItem.id) {
              return {
                ...masterItem,
                categoryName: c.categoryName,
                isEnabled: true,
                weight: preservedWeight,
              };
            }
            if (p.id === oldParamId && oldParamId !== masterItem.id) {
              return { ...p, isEnabled: false, weight: 0 };
            }
            return c.hasSubIndicators ? p : { ...p, isEnabled: false, weight: 0 };
          });
        } else {
          // Sisipkan masterItem dari lintas kamus ke posisi oldParam
          nextParams = c.parameters.map((p) => {
            if (p.id === oldParamId) {
              return {
                ...masterItem,
                categoryName: c.categoryName,
                isEnabled: true,
                weight: preservedWeight,
              };
            }
            return c.hasSubIndicators ? p : { ...p, isEnabled: false, weight: 0 };
          });
        }

        return {
          ...c,
          // Jika Parameter 1 dalam mode Direct (bukan Target Kerja), selaraskan nama parameter jika diinginkan
          categoryName:
            catIdx === 0 && !c.hasSubIndicators ? masterItem.name : c.categoryName,
          parameters: nextParams,
        };
      })
    );

    setEditModalState((prev) =>
      prev ? { ...prev, paramId: masterItem.id } : null
    );
  };

  // Toggle tambah/hapus sub-indikator dari Kamus Parameter KPI (di dalam Modal Edit)
  const toggleSubIndicatorFromDictionary = (catIdx: number, masterParam: GeneratePreviewParameter) => {
    mutateActiveCategories((prev) =>
      prev.map((c, idx) => {
        if (idx !== catIdx) return c;

        const exists = c.parameters.find((p) => p.id === masterParam.id);
        let updatedParams: GeneratePreviewParameter[];

        if (c.hasSubIndicators) {
          if (exists) {
            updatedParams = c.parameters.map((p) =>
              p.id === masterParam.id ? { ...p, isEnabled: !p.isEnabled } : p
            );
          } else {
            updatedParams = [
              ...c.parameters,
              {
                ...masterParam,
                categoryName: c.categoryName,
                isEnabled: true,
                weight: 0,
              },
            ];
          }

          const enabledList = updatedParams.filter((p) => p.isEnabled);
          const count = enabledList.length;
          if (count > 0) {
            const perWeight = Math.round((100 / count) * 10) / 10;
            let eIdx = 0;
            return {
              ...c,
              parameters: updatedParams.map((p) => {
                if (!p.isEnabled) return { ...p, weight: 0 };
                const w =
                  eIdx === count - 1
                    ? Math.round((100 - perWeight * (count - 1)) * 10) / 10
                    : perWeight;
                eIdx++;
                return { ...p, weight: w };
              }),
            };
          }
          return { ...c, parameters: updatedParams };
        } else {
          if (exists) {
            updatedParams = c.parameters.map((p) => ({
              ...p,
              isEnabled: p.id === masterParam.id,
              weight: p.id === masterParam.id ? 100 : 0,
            }));
          } else {
            updatedParams = [
              ...c.parameters.map((p) => ({ ...p, isEnabled: false, weight: 0 })),
              {
                ...masterParam,
                categoryName: c.categoryName,
                isEnabled: true,
                weight: 100,
              },
            ];
          }
          return { ...c, parameters: updatedParams };
        }
      })
    );
  };

  // Tambah indikator baru langsung ke Kamus Parameter KPI & aktifkan khusus untuk karyawan aktif (atau semua jika mode ALL)
  const handleQuickAddToDictionary = async () => {
    if (!previewData || !editModalState) return;
    const trimmedName = editModalSearch.trim();
    if (!trimmedName) return;

    const targetCat = activeCategories[editModalState.catIdx];
    if (!targetCat) return;

    setIsAddingToDictionary(true);
    try {
      const res = await createMasterParameterFromImportAction({
        name: trimmedName,
        departmentId: previewData.department.id,
        categoryName: targetCat.categoryName || "Target Kerja",
        unit: "%",
        target: "100%",
        inputType: "PERCENTAGE",
      });

      if (!res.success || !res.masterParameter) {
        await Swal.fire({
          icon: "error",
          title: "Gagal Menambahkan Indikator",
          text: res.error || "Tidak dapat menyimpan indikator ke Kamus Parameter KPI.",
        });
        return;
      }

      const mp = res.masterParameter;
      const defaultScoringRules: GeneratePreviewBand[] =
        Array.isArray(mp.defaultBands) && mp.defaultBands.length > 0
          ? mp.defaultBands.map((b: any, idx: number) => ({
              label: b.label || "-",
              operator: b.operator || "TEXT",
              minValue: b.minValue ?? null,
              maxValue: b.maxValue ?? null,
              score: Number(b.score) || 0,
              sortOrder: idx + 1,
            }))
          : [
              { label: ">= 100%", operator: "GTE", minValue: 100, maxValue: null, score: 25, sortOrder: 1 },
              { label: "85% - 99%", operator: "BETWEEN", minValue: 85, maxValue: 99, score: 15, sortOrder: 2 },
              { label: "< 85%", operator: "LT", minValue: null, maxValue: 85, score: 5, sortOrder: 3 },
            ];

      const newParamObj: GeneratePreviewParameter = {
        id: mp.id,
        code: mp.code || null,
        name: mp.name,
        description: mp.description || null,
        categoryName: targetCat.categoryName,
        departmentId: mp.departmentId ?? previewData.department.id,
        scope: "INDIVIDUAL",
        inputType: "PERCENTAGE",
        unit: mp.unit || "%",
        target: mp.target || "100%",
        weight: 0,
        scoringRules: defaultScoringRules,
        isEnabled: true,
      };

      // Tambahkan ke daftar kamus lokal previewData (sebagai kandidat kamus, tidak aktif bagi karyawan lain)
      setPreviewData((prev) => {
        if (!prev) return prev;
        const alreadyExists = prev.allMasterParameters.some((m) => m.id === newParamObj.id);
        return {
          ...prev,
          allMasterParameters: alreadyExists
            ? prev.allMasterParameters
            : [{ ...newParamObj, isEnabled: false, weight: 0 }, ...prev.allMasterParameters],
        };
      });

      // Aktifkan otomatis pada target yang sedang dipilih (unik ke Karyawan A jika sedang mode karyawan A)
      if (targetCat.hasSubIndicators) {
        toggleSubIndicatorFromDictionary(editModalState.catIdx, newParamObj);
      } else {
        mutateActiveCategories((prev) =>
          prev.map((c, idx) => {
            if (idx !== editModalState.catIdx) return c;
            const filtered = c.parameters
              .filter((p) => p.id !== newParamObj.id)
              .map((p) => ({ ...p, isEnabled: false, weight: 0 }));
            return {
              ...c,
              categoryName: editModalState.catIdx === 0 ? newParamObj.name : c.categoryName,
              parameters: [{ ...newParamObj, isEnabled: true, weight: 100 }, ...filtered],
            };
          })
        );
      }

      setEditModalState((prev) =>
        prev ? { ...prev, paramId: newParamObj.id } : null
      );
      setEditModalSearch("");
    } finally {
      setIsAddingToDictionary(false);
    }
  };

  const distributeSubIndicatorWeightsEvenly = (catIdx: number) => {
    mutateActiveCategories((prev) =>
      prev.map((c, idx) => {
        if (idx !== catIdx) return c;
        const enabledList = c.parameters.filter((p) => p.isEnabled);
        const count = enabledList.length;
        if (count === 0) return c;
        const perWeight = Math.round((100 / count) * 10) / 10;
        let eIdx = 0;
        return {
          ...c,
          parameters: c.parameters.map((p) => {
            if (!p.isEnabled) return { ...p, weight: 0 };
            const w =
              eIdx === count - 1
                ? Math.round((100 - perWeight * (count - 1)) * 10) / 10
                : perWeight;
            eIdx++;
            return { ...p, weight: w };
          }),
        };
      })
    );
  };

  const updateParameterField = (
    catIdx: number,
    paramId: number,
    field: keyof GeneratePreviewParameter,
    value: string | number | boolean
  ) => {
    mutateActiveCategories((prev) =>
      prev.map((c, idx) => {
        if (idx !== catIdx) return c;
        return {
          ...c,
          parameters: c.parameters.map((p) => (p.id === paramId ? { ...p, [field]: value } : p)),
        };
      })
    );
  };

  const updateParameterBand = (
    catIdx: number,
    paramId: number,
    bandIdx: number,
    field: keyof GeneratePreviewBand,
    value: string | number | null
  ) => {
    mutateActiveCategories((prev) =>
      prev.map((c, idx) => {
        if (idx !== catIdx) return c;
        return {
          ...c,
          parameters: c.parameters.map((p) => {
            if (p.id !== paramId) return p;
            const nextBands = p.scoringRules.map((b, bIdx) =>
              bIdx === bandIdx ? { ...b, [field]: value } : b
            );
            return { ...p, scoringRules: nextBands };
          }),
        };
      })
    );
  };

  // Konversi GeneratePreviewCategory[] menjadi payload server
  const serializeCategoriesToPayload = (
    cats: GeneratePreviewCategory[]
  ): CategoryGeneratePayloadItem[] => {
    return cats.map((c, idx) => {
      const enabledParams = c.parameters.filter((p) => p.isEnabled);
      return {
        name: c.categoryName,
        categoryType: c.categoryType,
        weight: Number(c.categoryWeight) || 0,
        sortOrder: c.sortOrder || idx + 1,
        parameters: enabledParams.map((p) => ({
          masterParameterId: p.id > 0 ? p.id : null,
          name: p.name,
          description: p.description,
          target: p.target,
          unit: p.unit,
          weight: Number(p.weight) || 0,
          scope: p.scope,
          inputType: p.inputType,
          scoringRules: p.scoringRules,
        })),
      };
    });
  };

  const buildEmployeeOverridesPayload = () => {
    const out: Record<number, CategoryGeneratePayloadItem[]> = {};
    for (const [empIdStr, customCats] of Object.entries(employeeCategoriesMap)) {
      out[Number(empIdStr)] = serializeCategoriesToPayload(customCats);
    }
    return out;
  };

  // Validasi sebelum pindah ke Tahap 3 (Wajib 5 Parameter terisi, Total Bobot 115%, Sub-Indikator 100%)
  const handleProceedToReview = () => {
    for (const c of activeCategories) {
      const enabled = c.parameters.filter((p) => p.isEnabled);
      if (enabled.length === 0) {
        setErrorMsg(`Parameter "${c.categoryName}" wajib memiliki minimal 1 indikator terpilih.`);
        return;
      }
      if (c.hasSubIndicators) {
        const subSum =
          Math.round(
            enabled.reduce((acc, curr) => acc + (Number(curr.weight) || 0), 0) * 10
          ) / 10;
        if (Math.abs(subSum - 100) > 0.5) {
          setErrorMsg(
            `Total bobot sub-indikator pada "${c.categoryName}" wajib 100% (saat ini: ${subSum}%). Klik "Bagi Rata Bobot" untuk menyesuaikan otomatis.`
          );
          return;
        }
      }
    }
    if (Math.abs(totalCategoryWeight - 115) > 0.5) {
      setErrorMsg(
        `Total bobot 5 Parameter KPI wajib 115% (saat ini: ${totalCategoryWeight}%). Standar: Target Kerja 65%, Kehadiran & Disiplin 20%, Keselamatan Kerja 10%, Kepatuhan & SP 10%, Inovasi & Improvement 10%.`
      );
      return;
    }
    setErrorMsg(null);
    setStep(3);
  };

  // Eksekusi Simpan Per Karyawan (Individual)
  const handleSaveSingleEmployee = async (employeeId: number) => {
    if (!previewData) return;
    setGeneratingEmpId(employeeId);
    setErrorMsg(null);

    try {
      const empCats = employeeCategoriesMap[employeeId] || activeCategories;
      const httpRes = await fetch("/api/admin/template-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: previewData.department.id,
          jobCategoryId: previewData.jobCategory.id,
          periodId: previewData.period.id,
          duplicateHandling,
          assignedEmployeeIds: [employeeId],
          categories: serializeCategoriesToPayload(empCats),
        }),
      });
      const res = (await httpRes.json()) as {
        success: boolean;
        results?: EmployeeGenerateResult[];
        error?: string;
      };

      if (!res.success || !res.results || res.results.length === 0) {
        setErrorMsg(res.error || "Gagal menyimpan KPI untuk karyawan ini.");
        return;
      }

      const singleResult = res.results[0];
      setEmployeeResultsMap((prev) => ({
        ...prev,
        [employeeId]: singleResult,
      }));

      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan KPI.");
    } finally {
      setGeneratingEmpId(null);
    }
  };

  // Eksekusi Simpan Semua Karyawan Terpilih
  const handleSaveAllEmployees = async () => {
    if (!previewData) return;
    if (selectedEmpIds.size === 0) {
      setErrorMsg("Pilih minimal 1 karyawan untuk digenerate KPI-nya.");
      return;
    }

    setIsGeneratingAll(true);
    setErrorMsg(null);

    try {
      const httpRes = await fetch("/api/admin/template-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: previewData.department.id,
          jobCategoryId: previewData.jobCategory.id,
          periodId: previewData.period.id,
          duplicateHandling,
          assignedEmployeeIds: Array.from(selectedEmpIds),
          categories: serializeCategoriesToPayload(activeCategories),
          employeeCategoriesOverride: buildEmployeeOverridesPayload(),
        }),
      });
      const res = (await httpRes.json()) as {
        success: boolean;
        results?: EmployeeGenerateResult[];
        successCount?: number;
        skippedCount?: number;
        failedCount?: number;
        error?: string;
      };

      if (!res.success || !res.results) {
        setErrorMsg(res.error || "Gagal melakukan generate KPI karyawan.");
        return;
      }

      const nextMap: Record<number, EmployeeGenerateResult> = { ...employeeResultsMap };
      for (const item of res.results) {
        nextMap[item.employeeId] = item;
      }
      setEmployeeResultsMap(nextMap);

      router.refresh();

      await Swal.fire({
        icon: (res.failedCount || 0) > 0 && (res.successCount || 0) === 0 ? "warning" : "success",
        title: "Proses Generate KPI Selesai",
        html: `
          <div class="text-left text-xs text-slate-600 space-y-1.5 mt-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div><strong>Departemen:</strong> ${previewData.department.name}</div>
            <div><strong>Job Category:</strong> ${previewData.jobCategory.name}</div>
            <div><strong>Berhasil Dibuat / Diperbarui:</strong> ${res.successCount || 0} Karyawan</div>
            <div><strong>Dilewati (Cegah Duplikasi):</strong> ${res.skippedCount || 0} Karyawan</div>
            <div><strong>Gagal:</strong> ${res.failedCount || 0} Karyawan</div>
          </div>
        `,
        confirmButtonColor: "#059669",
        confirmButtonText: "Kembali ke Master Template",
      });

      onClose();
      onSuccess?.();
      window.location.href = "/setup/templates";
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Terjadi kesalahan saat memproses data.");
    } finally {
      setIsGeneratingAll(false);
    }
  };

  // Ringkasan hasil eksekusi
  const executionSummary = useMemo(() => {
    const list = Object.values(employeeResultsMap);
    return {
      totalDone: list.length,
      success: list.filter((r) => r.status === "SUCCESS" || r.status === "UPDATED").length,
      skipped: list.filter((r) => r.status === "SKIPPED").length,
      failed: list.filter((r) => r.status === "FAILED").length,
    };
  }, [employeeResultsMap]);

  // Data untuk Sub-Modal Edit (di kolom Aksi)
  const activeEditModalData = useMemo(() => {
    if (!editModalState || !previewData) return null;
    const cat = activeCategories[editModalState.catIdx];
    if (!cat) return null;
    const currentParam =
      cat.parameters.find((p) => p.id === editModalState.paramId) ||
      cat.parameters.find((p) => p.isEnabled) ||
      cat.parameters[0];

    const q = editModalSearch.toLowerCase().trim();
    // Gabungkan indikator kategori ini + seluruh indikator Kamus Parameter KPI agar bisa ambil dari kamus jika Parameter 1 bukan Target Kerja
    const combinedMap = new Map<number, GeneratePreviewParameter>();
    for (const p of cat.parameters) {
      combinedMap.set(p.id, p);
    }
    for (const m of previewData.allMasterParameters) {
      if (!combinedMap.has(m.id)) {
        combinedMap.set(m.id, { ...m, isEnabled: false, weight: 0 });
      }
    }

    // Urutkan agar indikator yang sedang aktif berada di urutan paling atas
    const allCandidates = Array.from(combinedMap.values())
      .filter(
        (item) =>
          !q ||
          item.name.toLowerCase().includes(q) ||
          (item.code && item.code.toLowerCase().includes(q)) ||
          item.categoryName.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const aActive = cat.parameters.some((p) => p.id === a.id && p.isEnabled) ? 1 : 0;
        const bActive = cat.parameters.some((p) => p.id === b.id && p.isEnabled) ? 1 : 0;
        return bActive - aActive;
      });

    return {
      catIdx: editModalState.catIdx,
      cat,
      currentParam,
      allCandidates,
    };
  }, [editModalState, activeCategories, previewData, editModalSearch]);

  // Data untuk Sub-Modal Kriteria Penilaian
  const activeCriteriaParam = useMemo(() => {
    if (!criteriaModalTarget) return null;
    const cat = activeCategories[criteriaModalTarget.catIdx];
    if (!cat) return null;
    const param = cat.parameters.find((p) => p.id === criteriaModalTarget.paramId);
    if (!param) return null;
    return { catIdx: criteriaModalTarget.catIdx, categoryName: cat.categoryName, param };
  }, [criteriaModalTarget, activeCategories]);

  // Data untuk Modal View Master Template KPI per Karyawan di Tahap 3
  const viewingTemplateBundle = useMemo(() => {
    if (viewingEmployeeId === null || !previewData) return null;
    const emp = previewData.employees.find((e) => e.id === viewingEmployeeId);
    if (!emp) return null;

    const empCats = employeeCategoriesMap[emp.id] || activeCategories;
    const savedResult = employeeResultsMap[emp.id];
    const tplId = savedResult?.templateId || -emp.id;

    const templateObj: KpiTemplate = {
      id: tplId,
      code: savedResult?.templateId ? `TPL-${savedResult.templateId}` : `PREVIEW-${emp.id}`,
      name: emp.generatedTemplateName,
      departmentId: previewData.department.id,
      jobLevelId: emp.jobLevelId,
      jobPositionId: emp.jobPositionId,
      jobCategoryId: previewData.jobCategory.id,
      periodId: previewData.period.id,
      effectiveDate: previewData.period.startDate,
      description: `Template KPI ${emp.name} (${emp.jobPositionName})`,
      siteId: null,
      site: emp.operatingUnit || "HO",
      pitId: null,
      departmentMappingId: null,
      totalWeight: "1.1500",
      version: 1,
      employeeId: emp.id,
      baseTemplateId: null,
      isCustom: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const categoriesList: KpiCategory[] = [];
    const parametersList: KpiParameter[] = [];
    const bandsList: KpiBand[] = [];

    empCats.forEach((c, cIdx) => {
      const catId = cIdx + 1;
      categoriesList.push({
        id: catId,
        templateId: tplId,
        name: c.categoryName,
        weight: ((Number(c.categoryWeight) || 0) / 100).toFixed(4),
        categoryType: c.categoryType,
        sortOrder: c.sortOrder || cIdx + 1,
      });

      const enabledParams = c.parameters.filter((p) => p.isEnabled);
      enabledParams.forEach((p, pIdx) => {
        const pId = p.id;
        parametersList.push({
          id: pId,
          categoryId: catId,
          name: p.name,
          description: p.description,
          weight: ((Number(p.weight) || 0) / 100).toFixed(4),
          maxScore: "100.00",
          inputType: (p.inputType as KpiParameter["inputType"]) || "NUMBER",
          aggregation: "AVERAGE",
          compareBasis: "ACTUAL",
          unit: p.unit,
          target: p.target,
          picRole: "HEAD_DEPT",
          isMonthly: false,
          sortOrder: pIdx + 1,
          parentParameterId: null,
          masterParameterId: p.id > 0 ? p.id : null,
          calculationRuleId: null,
          measurementType: null,
          direction: null,
          scoringMethod: null,
          scope: p.scope || "INDIVIDUAL",
        });

        p.scoringRules.forEach((b, bIdx) => {
          bandsList.push({
            id: pId * 1000 + bIdx,
            parameterId: pId,
            label: b.label,
            operator: (b.operator as KpiBand["operator"]) || "TEXT",
            minValue: b.minValue !== null && b.minValue !== undefined ? String(b.minValue) : null,
            maxValue: b.maxValue !== null && b.maxValue !== undefined ? String(b.maxValue) : null,
            score: String(b.score),
            sortOrder: bIdx + 1,
          });
        });
      });
    });

    const deptObj =
      departments.find((d) => d.id === previewData.department.id) || {
        id: previewData.department.id,
        code: previewData.department.code,
        name: previewData.department.name,
        createdAt: new Date(),
      };

    const jobLevelObj: JobLevel = {
      id: emp.jobLevelId,
      code: emp.jobLevelName.toUpperCase(),
      name: emp.jobLevelName,
      rank: 0,
      appraiserLevel: null,
      appraiser1: null,
      appraiser2: null,
      hierarchyStatus: "Active",
    };

    return {
      template: templateObj,
      department: deptObj,
      jobLevel: jobLevelObj,
      employee: {
        id: emp.id,
        nik: emp.nik,
        name: emp.name,
        jobPosition: emp.jobPositionName,
        departmentName: emp.departmentName,
      },
      categories: categoriesList,
      parameters: parametersList,
      bands: bandsList,
    };
  }, [
    viewingEmployeeId,
    previewData,
    employeeCategoriesMap,
    activeCategories,
    employeeResultsMap,
    departments,
  ]);

  if (!isOpen) return null;

  const targetKerjaCat = activeCategories[0] || null;
  const directCategories = activeCategories.slice(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden my-auto">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-slate-900">Generate Template KPI</h2>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Departemen + Job Category
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Pilih karyawan hasil mapping, susun 5 Parameter KPI dari Kamus KPI, lalu simpan per karyawan atau sekaligus.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGuideModal(true)}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-blue-200 bg-blue-50/80 text-blue-700 hover:bg-blue-100 text-xs font-semibold transition-colors cursor-pointer"
              title="Panduan Penggunaan Generate Template KPI"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Panduan</span>
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoadingPreview || isGeneratingAll || generatingEmpId !== null}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigasi Tahapan (Stepper) + Dropdown Pilih Karyawan (Atas Nama Siapa) */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 text-xs">
            <button
              type="button"
              onClick={() => setStep(1)}
              className={`flex items-center gap-2 font-semibold transition-colors cursor-pointer ${
                step === 1 ? "text-emerald-700" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  step === 1
                    ? "bg-emerald-600 text-white"
                    : step > 1
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {step > 1 ? <Check className="w-3 h-3" /> : "1"}
              </span>
              <span>Pilih Karyawan</span>
            </button>

            <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />

            <button
              type="button"
              disabled={!previewData || selectedEmpIds.size === 0}
              onClick={() => setStep(2)}
              className={`flex items-center gap-2 font-semibold transition-colors disabled:opacity-40 cursor-pointer ${
                step === 2 ? "text-emerald-700" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  step === 2
                    ? "bg-emerald-600 text-white"
                    : step > 2
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {step > 2 ? <Check className="w-3 h-3" /> : "2"}
              </span>
              <span>Susun 5 Parameter KPI</span>
            </button>

            <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />

            <button
              type="button"
              disabled={!previewData || selectedEmpIds.size === 0}
              onClick={handleProceedToReview}
              className={`flex items-center gap-2 font-semibold transition-colors disabled:opacity-40 cursor-pointer ${
                step === 3 ? "text-emerald-700" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  step === 3 ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
                }`}
              >
                3
              </span>
              <span>Review & Simpan KPI</span>
            </button>
          </div>

          {previewData && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              {/* Dropdown Fleksibel Pilih Template Atas Nama Siapa */}
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                <span className="text-slate-500 font-medium">Karyawan:</span>
                <select
                  value={activeEmployeeTarget}
                  onChange={(e) => handleSelectActiveEmployeeTarget(e.target.value)}
                  className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer max-w-[240px] truncate"
                  title="Pilih template atas nama karyawan tertentu atau semua karyawan terpilih"
                >
                  <option value="ALL">
                    Semua Terpilih ({selectedEmpIds.size} Karyawan)
                  </option>
                  {previewData.employees.map((emp) => (
                    <option key={emp.id} value={String(emp.id)}>
                      {emp.name} ({emp.jobPositionName})
                    </option>
                  ))}
                </select>
              </div>

              <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                Total Bobot:{" "}
                <strong
                  className={
                    Math.abs(totalCategoryWeight - 115) <= 0.5
                      ? "text-emerald-700"
                      : "text-amber-700"
                  }
                >
                  {totalCategoryWeight}% / 115%
                </strong>
              </span>
            </div>
          )}
        </div>

        {/* Pesan Error */}
        {errorMsg && (
          <div className="mx-6 mt-4 px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-between gap-2 text-xs text-rose-700 shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-rose-600 hover:text-rose-800 text-[11px] font-semibold cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Body Modal */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ================= TAHAP 1: PILIH DEPARTEMEN, JOB CATEGORY & KARYAWAN ================= */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Baris Pilihan Kombinasi */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 bg-slate-50/80 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Departemen <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:border-emerald-600"
                  >
                    <option value="">-- Pilih Departemen --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Job Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={jobCategoryId}
                    onChange={(e) => setJobCategoryId(e.target.value)}
                    disabled={!departmentId || availableJobCategories.length === 0}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:border-emerald-600 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">
                      {!departmentId
                        ? "-- Pilih Departemen Dulu --"
                        : availableJobCategories.length === 0
                        ? "-- Belum Ada Mapping Category --"
                        : "-- Pilih Job Category --"}
                    </option>
                    {availableJobCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Periode Evaluasi <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={periodId}
                    onChange={(e) => setPeriodId(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:border-emerald-600"
                  >
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.year}) {p.status === "ACTIVE" ? "- Aktif" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tabel Karyawan Sesuai Mapping */}
              {isLoadingPreview ? (
                <div className="py-14 flex flex-col items-center justify-center text-slate-500 gap-2 border border-slate-200 rounded-xl bg-white">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                  <p className="text-xs">Memuat daftar karyawan dan parameter Kamus KPI...</p>
                </div>
              ) : !previewData ? (
                <div className="py-12 text-center border border-dashed border-slate-300 rounded-xl bg-slate-50/50">
                  <p className="text-xs text-slate-500">
                    Pilih <strong>Departemen</strong> dan <strong>Job Category</strong> untuk menampilkan daftar karyawan.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-800">
                      Karyawan Terpilih:{" "}
                      <span className="text-emerald-700 font-bold">
                        {selectedEmpIds.size} dari {previewData.employees.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative w-60">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={empSearch}
                          onChange={(e) => setEmpSearch(e.target.value)}
                          placeholder="Cari nama atau NIK..."
                          className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-300 text-xs focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={toggleAllEmployees}
                        disabled={previewData.employees.filter((e) => !e.hasExistingKpi).length === 0}
                        className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-slate-700 transition-colors cursor-pointer"
                      >
                        {(() => {
                          const available = previewData.employees.filter((e) => !e.hasExistingKpi);
                          return available.length > 0 && selectedEmpIds.size === available.length
                            ? "Batal Pilih Semua"
                            : "Pilih Semua Tersedia";
                        })()}
                      </button>
                    </div>
                  </div>

                  {previewData.employees.length === 0 ? (
                    <div className="py-10 text-center border border-slate-200 rounded-xl bg-slate-50 text-xs text-slate-500">
                      Tidak ditemukan karyawan aktif untuk kombinasi ini.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <div className="max-h-[320px] overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 text-[11px] font-semibold text-slate-600">
                            <tr>
                              <th className="py-2.5 px-3.5 w-10">
                                {(() => {
                                  const available = previewData.employees.filter((e) => !e.hasExistingKpi);
                                  return (
                                    <input
                                      type="checkbox"
                                      disabled={available.length === 0}
                                      checked={
                                        available.length > 0 &&
                                        selectedEmpIds.size === available.length
                                      }
                                      onChange={toggleAllEmployees}
                                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 disabled:opacity-40"
                                      title={available.length === 0 ? "Tidak ada karyawan yang tersedia" : "Pilih semua yang belum memiliki template"}
                                    />
                                  );
                                })()}
                              </th>
                              <th className="py-2.5 px-3">Karyawan</th>
                              <th className="py-2.5 px-3">Job Position</th>
                              <th className="py-2.5 px-3">Nama KPI Hasil Generate</th>
                              <th className="py-2.5 px-3.5 text-right">Status KPI</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {filteredEmployees.map((emp) => {
                              const isSelected = selectedEmpIds.has(emp.id);
                              const isDisabled = Boolean(emp.hasExistingKpi);

                              return (
                                <tr
                                  key={emp.id}
                                  onClick={() => !isDisabled && toggleEmployee(emp.id)}
                                  className={`transition-colors ${
                                    isDisabled
                                      ? "opacity-60 bg-slate-50 cursor-not-allowed select-none"
                                      : isSelected
                                      ? "bg-emerald-50/40 hover:bg-emerald-50/70 cursor-pointer"
                                      : "hover:bg-slate-50 cursor-pointer"
                                  }`}
                                >
                                  <td className="py-2.5 px-3.5" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      disabled={isDisabled}
                                      onChange={() => toggleEmployee(emp.id)}
                                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                    />
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className={`font-semibold ${isDisabled ? "text-slate-600" : "text-slate-900"}`}>
                                      {emp.name}
                                    </div>
                                    <div className="text-[11px] text-slate-400 font-mono">
                                      {emp.nik}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600">
                                    <div>{emp.jobPositionName}</div>
                                    <div className="text-[10px] text-slate-400">
                                      {emp.jobLevelName}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-[11px] text-slate-700">
                                    {emp.generatedTemplateName}
                                  </td>
                                  <td className="py-2.5 px-3.5 text-right">
                                    {emp.hasExistingKpi ? (
                                      <span
                                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200"
                                        title={emp.currentTemplateName ? `Template aktif: ${emp.currentTemplateName}` : undefined}
                                      >
                                        Sudah Ada Template
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        Tersedia
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================= TAHAP 2: SUSUN 5 PARAMETER KPI ================= */}
          {step === 2 && previewData && (
            <div className="space-y-4">
              {/* Bar Pilih Template Atas Nama Karyawan */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  <span className="font-semibold text-slate-700">Template KPI Atas Nama:</span>
                  <select
                    value={activeEmployeeTarget}
                    onChange={(e) => handleSelectActiveEmployeeTarget(e.target.value)}
                    className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600 cursor-pointer"
                  >
                    <option value="ALL">
                      Semua Karyawan Terpilih ({selectedEmpIds.size} Karyawan)
                    </option>
                    {previewData.employees.map((emp) => (
                      <option key={emp.id} value={String(emp.id)}>
                        {emp.name} - {emp.departmentName} - {emp.jobPositionName}
                      </option>
                    ))}
                  </select>
                </div>

                {currentTargetEmployeeObj ? (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-emerald-700 font-medium">
                      Mode Kustomisasi Individual: <strong>{currentTargetEmployeeObj.name}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={applyCurrentToAllEmployees}
                      className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold transition-colors cursor-pointer"
                    >
                      Terapkan ke Semua Karyawan
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-500">
                    Pilih nama karyawan di samping jika ingin membedakan sub-indikator per individu.
                  </span>
                )}
              </div>

              {/* BAGIAN 1: PARAMETER 1 */}
              {targetKerjaCat && (() => {
                const enabledSubs = targetKerjaCat.parameters.filter((p) => p.isEnabled);
                const subWeightSum =
                  Math.round(
                    enabledSubs.reduce((acc, curr) => acc + (Number(curr.weight) || 0), 0) * 10
                  ) / 10;

                return (
                  <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">
                          1
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            {targetKerjaCat.categoryName}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {targetKerjaCat.hasSubIndicators
                              ? `${enabledSubs.length} Sub-Indikator Aktif`
                              : "Penilaian Langsung"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium text-slate-600">
                            Bobot Parameter:
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={targetKerjaCat.categoryWeight}
                            onChange={(e) =>
                              updateCategoryWeight(0, Number(e.target.value) || 0)
                            }
                            className="w-16 h-8 px-2 rounded-lg border border-slate-300 text-xs font-bold text-center text-slate-900 bg-white focus:outline-none focus:border-emerald-600"
                          />
                          <span className="text-xs font-semibold text-slate-500">%</span>
                        </div>
                      </div>
                    </div>

                    {enabledSubs.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500">
                        Belum ada indikator dipilih. Klik{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setEditModalSearch("");
                            setEditModalState({
                              catIdx: 0,
                              paramId: targetKerjaCat.parameters[0]?.id || 0,
                              activeTab: "MANAGE_SUBS",
                            });
                          }}
                          className="text-emerald-700 font-semibold underline cursor-pointer"
                        >
                          Edit Sub-Indikator
                        </button>{" "}
                        untuk memilih dari Kamus Parameter KPI.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-slate-50/60 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                            <tr>
                              <th className="py-2 px-4 w-12">No</th>
                              <th className="py-2 px-3">
                                {targetKerjaCat.hasSubIndicators
                                  ? `Sub-Indikator ${targetKerjaCat.categoryName}`
                                  : `Indikator ${targetKerjaCat.categoryName}`}
                              </th>
                              <th className="py-2 px-3 w-28 text-center">Target</th>
                              <th className="py-2 px-3 w-28 text-center">Satuan</th>
                              <th className="py-2 px-3 w-28 text-center">Bobot Sub</th>
                              <th className="py-2 px-3 w-28 text-center">Kriteria</th>
                              <th className="py-2 px-4 w-28 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {enabledSubs.map((param, pIdx) => (
                              <tr key={param.id} className="hover:bg-slate-50/50">
                                <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">
                                  1.{pIdx + 1}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2">
                                    {param.code && (
                                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] border border-slate-200">
                                        {param.code}
                                      </span>
                                    )}
                                    <span className="font-medium text-slate-900">{param.name}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <input
                                    type="text"
                                    value={param.target}
                                    onChange={(e) =>
                                      updateParameterField(0, param.id, "target", e.target.value)
                                    }
                                    className="w-24 h-7 px-2 rounded border border-slate-300 text-xs text-center font-medium text-slate-800 focus:outline-none focus:border-emerald-600"
                                  />
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <select
                                    value={param.unit || "%"}
                                    onChange={(e) =>
                                      updateParameterField(0, param.id, "unit", e.target.value)
                                    }
                                    className="w-24 h-7 px-2 rounded border border-slate-300 bg-white text-xs text-slate-700 focus:outline-none focus:border-emerald-600 cursor-pointer"
                                  >
                                    {param.unit && !SATUAN_OPTIONS.includes(param.unit) && (
                                      <option value={param.unit}>{param.unit}</option>
                                    )}
                                    {SATUAN_OPTIONS.map((u) => (
                                      <option key={u} value={u}>
                                        {u}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <div className="inline-flex items-center gap-1">
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      disabled={!targetKerjaCat.hasSubIndicators}
                                      value={param.weight}
                                      onChange={(e) =>
                                        updateParameterField(
                                          0,
                                          param.id,
                                          "weight",
                                          Number(e.target.value) || 0
                                        )
                                      }
                                      className="w-16 h-7 px-2 rounded border border-slate-300 text-xs text-center font-semibold text-slate-900 disabled:bg-slate-100 focus:outline-none focus:border-emerald-600"
                                    />
                                    <span className="text-[11px] text-slate-400">%</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCriteriaModalTarget({ catIdx: 0, paramId: param.id })
                                    }
                                    className="h-7 px-2.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-medium text-slate-700 transition-colors cursor-pointer"
                                  >
                                    {param.scoringRules.length} Kriteria
                                  </button>
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  <div className="inline-flex items-center gap-2.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditModalSearch("");
                                        setEditModalState({
                                          catIdx: 0,
                                          paramId: param.id,
                                          activeTab: "EDIT_ITEM",
                                        });
                                      }}
                                      className="text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer"
                                    >
                                      Edit
                                    </button>
                                    {targetKerjaCat.hasSubIndicators && enabledSubs.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          toggleSubIndicatorFromDictionary(0, param)
                                        }
                                        className="text-[11px] text-rose-600 hover:text-rose-800 font-medium cursor-pointer"
                                      >
                                        Hapus
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

                    <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                      <span>
                        Total bobot internal {targetKerjaCat.categoryName}:
                      </span>
                      <span
                        className={`font-semibold ${
                          Math.abs(subWeightSum - 100) <= 0.5
                            ? "text-emerald-700"
                            : "text-amber-700"
                        }`}
                      >
                        {subWeightSum}% (Standar: 100%)
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* BAGIAN 2: PARAMETER 2 S/D 5 (INDIKATOR PENILAIAN LANGSUNG DALAM 1 TABEL RINGKAS) */}
              <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Parameter 2 - 5 (Indikator Penilaian Langsung dari Kamus KPI)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Parameter di bawah menggunakan penilaian langsung tanpa sub-indikator.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50/60 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                      <tr>
                        <th className="py-2.5 px-4 w-12">No</th>
                        <th className="py-2.5 px-3">Parameter Utama</th>
                        <th className="py-2.5 px-3">Indikator Kamus KPI</th>
                        <th className="py-2.5 px-3 w-32 text-center">Target</th>
                        <th className="py-2.5 px-3 w-28 text-center">Satuan</th>
                        <th className="py-2.5 px-3 w-28 text-center">Kriteria</th>
                        <th className="py-2.5 px-3 w-28 text-center">Bobot Parameter</th>
                        <th className="py-2.5 px-4 w-20 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {directCategories.map((cat, dIdx) => {
                        const actualCatIdx = dIdx + 1;
                        const activeParam =
                          cat.parameters.find((p) => p.isEnabled) || cat.parameters[0];

                        return (
                          <tr key={cat.parameterKey} className="hover:bg-slate-50/50">
                            <td className="py-3 px-4">
                              <span className="w-5 h-5 rounded bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">
                                {actualCatIdx + 1}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-bold text-slate-900">
                              {cat.categoryName}
                            </td>
                            <td className="py-3 px-3">
                              {activeParam && (
                                <div className="flex items-center gap-2">
                                  {activeParam.code && (
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] border border-slate-200">
                                      {activeParam.code}
                                    </span>
                                  )}
                                  <span className="text-slate-700 font-medium">
                                    {activeParam.name}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {activeParam && (
                                <input
                                  type="text"
                                  value={activeParam.target}
                                  onChange={(e) =>
                                    updateParameterField(
                                      actualCatIdx,
                                      activeParam.id,
                                      "target",
                                      e.target.value
                                    )
                                  }
                                  className="w-28 h-7 px-2 rounded border border-slate-300 text-xs text-center font-medium text-slate-800 focus:outline-none focus:border-emerald-600"
                                />
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {activeParam && (
                                <select
                                  value={activeParam.unit || "%"}
                                  onChange={(e) =>
                                    updateParameterField(
                                      actualCatIdx,
                                      activeParam.id,
                                      "unit",
                                      e.target.value
                                    )
                                  }
                                  className="w-24 h-7 px-2 rounded border border-slate-300 bg-white text-xs text-slate-700 focus:outline-none focus:border-emerald-600 cursor-pointer"
                                >
                                  {activeParam.unit && !SATUAN_OPTIONS.includes(activeParam.unit) && (
                                    <option value={activeParam.unit}>{activeParam.unit}</option>
                                  )}
                                  {SATUAN_OPTIONS.map((u) => (
                                    <option key={u} value={u}>
                                      {u}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {activeParam && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCriteriaModalTarget({
                                      catIdx: actualCatIdx,
                                      paramId: activeParam.id,
                                    })
                                  }
                                  className="h-7 px-2.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-medium text-slate-700 transition-colors cursor-pointer"
                                >
                                  {activeParam.scoringRules.length} Kriteria
                                </button>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <div className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={cat.categoryWeight}
                                  onChange={(e) =>
                                    updateCategoryWeight(
                                      actualCatIdx,
                                      Number(e.target.value) || 0
                                    )
                                  }
                                  className="w-16 h-7 px-2 rounded border border-slate-300 text-xs font-bold text-center text-slate-900 focus:outline-none focus:border-emerald-600"
                                />
                                <span className="text-xs font-semibold text-slate-500">%</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {activeParam && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditModalSearch("");
                                    setEditModalState({
                                      catIdx: actualCatIdx,
                                      paramId: activeParam.id,
                                      activeTab: "EDIT_ITEM",
                                    });
                                  }}
                                  className="text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer"
                                >
                                  Edit
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAHAP 3: REVIEW & SIMPAN KPI KARYAWAN ================= */}
          {step === 3 && previewData && (
            <div className="space-y-4">
              {/* Baris Ringkasan & Validasi Duplikasi */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="text-[11px] text-slate-500">Departemen</div>
                    <div className="font-bold text-slate-900 mt-0.5">
                      {previewData.department.name}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Job Category</div>
                    <div className="font-bold text-slate-900 mt-0.5">
                      {previewData.jobCategory.name}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Periode</div>
                    <div className="font-bold text-slate-900 mt-0.5">
                      {previewData.period.name} ({previewData.period.year})
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">5 Parameter KPI</div>
                    <div className="font-bold text-emerald-700 mt-0.5">
                      {totalEnabledParamsCount} Indikator ({totalCategoryWeight}%)
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Penanganan Jika Karyawan Sudah Punya KPI:
                  </label>
                  <select
                    value={duplicateHandling}
                    onChange={(e) =>
                      setDuplicateHandling(
                        e.target.value as "UPDATE_EXISTING" | "SKIP_EXISTING"
                      )
                    }
                    className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:border-emerald-600"
                  >
                    <option value="UPDATE_EXISTING">
                      Perbarui / Sinkronkan struktur KPI Draft
                    </option>
                    <option value="SKIP_EXISTING">
                      Lewati karyawan yang sudah punya KPI
                    </option>
                  </select>
                </div>
              </div>

              {/* Tabel Eksekusi Simpan Per Karyawan & Status */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Daftar Karyawan Penerima KPI ({selectedEmployeesList.length} Karyawan)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Klik <strong>Simpan Per Karyawan</strong> pada baris karyawan atau{" "}
                      <strong>Simpan Semua Karyawan</strong> di bagian bawah.
                    </p>
                  </div>

                  {executionSummary.totalDone > 0 && (
                    <div className="flex items-center gap-2 text-[11px] font-semibold">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Berhasil: {executionSummary.success}
                      </span>
                      {executionSummary.skipped > 0 && (
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          Dilewati: {executionSummary.skipped}
                        </span>
                      )}
                      {executionSummary.failed > 0 && (
                        <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                          Gagal: {executionSummary.failed}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 text-[11px] font-semibold text-slate-600">
                      <tr>
                        <th className="py-2.5 px-4">Karyawan</th>
                        <th className="py-2.5 px-3">Nama Template KPI Individual</th>
                        <th className="py-2.5 px-3">Status Generate</th>
                        <th className="py-2.5 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {selectedEmployeesList.map((emp) => {
                        const res = employeeResultsMap[emp.id];
                        const isSavingThis = generatingEmpId === emp.id;
                        const hasCustomOverride = Boolean(employeeCategoriesMap[emp.id]);

                        return (
                          <tr key={emp.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-4">
                              <div className="font-semibold text-slate-900">{emp.name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">{emp.nik}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-800">
                                  {emp.generatedTemplateName}
                                </span>
                                {hasCustomOverride && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Kustom Individual
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {emp.departmentName} • {emp.jobPositionName}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              {!res ? (
                                emp.hasExistingKpi ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                    Sudah Ada KPI
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                                    Siap Digenerate
                                  </span>
                                )
                              ) : res.status === "SUCCESS" || res.status === "UPDATED" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Check className="w-3 h-3" />
                                  {res.status === "UPDATED"
                                    ? "Berhasil Diperbarui"
                                    : "Berhasil Dibuat"}
                                </span>
                              ) : res.status === "SKIPPED" ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                  Dilewati
                                </span>
                              ) : (
                                <div>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                    Gagal
                                  </span>
                                  <div className="text-[10px] text-rose-600 mt-0.5">
                                    {res.message}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveEmployeeTarget(String(emp.id));
                                    setViewingEmployeeId(emp.id);
                                  }}
                                  className="h-7 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <span>View</span>
                                </button>
                                {res?.templateId && (
                                  <Link
                                    href={`/setup/templates/${res.templateId}`}
                                    className="h-7 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-700 inline-flex items-center gap-1"
                                  >
                                    <span>Lihat KPI</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </Link>
                                )}
                                <button
                                  type="button"
                                  disabled={isSavingThis || isGeneratingAll}
                                  onClick={() => handleSaveSingleEmployee(emp.id)}
                                  className="h-7 px-3 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-semibold text-emerald-800 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                  {isSavingThis ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      <span>Menyimpan...</span>
                                    </>
                                  ) : res?.status === "SUCCESS" || res?.status === "UPDATED" ? (
                                    <span>Simpan Ulang</span>
                                  ) : (
                                    <span>Simpan Per Karyawan</span>
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            {step > 1 && (
              <button
                type="button"
                disabled={isGeneratingAll || generatingEmpId !== null}
                onClick={() => setStep((prev) => (prev === 3 ? 2 : 1))}
                className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Kembali</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isGeneratingAll || generatingEmpId !== null}
              onClick={handleClose}
              className="h-9 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {executionSummary.totalDone > 0 ? "Selesai & Tutup" : "Batal"}
            </button>

            {step === 1 && (
              <button
                type="button"
                disabled={!previewData || selectedEmpIds.size === 0 || isLoadingPreview}
                onClick={() => setStep(2)}
                className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <span>Lanjut Susun 5 Parameter</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                onClick={handleProceedToReview}
                className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Lanjut ke Review & Simpan</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                disabled={
                  isGeneratingAll ||
                  generatingEmpId !== null ||
                  selectedEmployeesList.length === 0
                }
                onClick={handleSaveAllEmployees}
                className="h-9 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-40 cursor-pointer"
              >
                {isGeneratingAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan Semua Karyawan...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Simpan Semua Karyawan ({selectedEmployeesList.length})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ================= RIGHT SIDE DRAWER 1: PENGATURAN PARAMETER KPI (KAMUS, BOBOT, & KRITERIA) ================= */}
      {activeEditModalData && editModalState && previewData && (
        <div
          className="fixed inset-0 z-[80] flex justify-end bg-slate-900/35 backdrop-blur-[1px]"
          onClick={() => setEditModalState(null)}
        >
          <div
            className="relative w-full max-w-xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Right Side Drawer */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3 bg-white shrink-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-5 h-5 rounded bg-emerald-600 text-white text-[11px] font-bold inline-flex items-center justify-center shrink-0">
                    {activeEditModalData.catIdx + 1}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    Edit Parameter {activeEditModalData.catIdx + 1}:{" "}
                    {activeEditModalData.cat.categoryName}
                  </h3>
                  {currentTargetEmployeeObj && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold whitespace-nowrap">
                      Khusus: {currentTargetEmployeeObj.name}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Pilih atau hapus indikator, tambahkan indikator baru ke kamus, atur bobot, dan sesuaikan kriteria penilaian.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowGuideModal(true)}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  title="Lihat panduan kustomisasi indikator per karyawan"
                >
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>Panduan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditModalState(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  title="Tutup panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Isi Right Side Drawer */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
              {/* BAGIAN 1: PENGATURAN PARAMETER UTAMA & BOBOT PARAMETER */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    1. Pengaturan Parameter &amp; Bobot Utama
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-600">
                      Bobot Parameter:
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={activeEditModalData.cat.categoryWeight}
                      onChange={(e) =>
                        updateCategoryWeight(
                          activeEditModalData.catIdx,
                          Number(e.target.value) || 0
                        )
                      }
                      className="w-16 h-7 px-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-center text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                    <span className="text-xs font-semibold text-slate-500">%</span>
                  </div>
                </div>

                {activeEditModalData.catIdx === 0 && (
                  <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                      <span className="text-[11px] font-semibold text-slate-600 shrink-0">
                        Nama Parameter 1:
                      </span>
                      <input
                        type="text"
                        value={activeEditModalData.cat.categoryName}
                        onChange={(e) =>
                          updateCategoryMeta(0, { categoryName: e.target.value })
                        }
                        placeholder="Target Kerja"
                        className="h-7 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600 flex-1"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          updateCategoryMeta(0, {
                            hasSubIndicators: true,
                            categoryType: "SUB_ITEMS",
                          })
                        }
                        className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                          activeEditModalData.cat.hasSubIndicators
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"
                        }`}
                      >
                        Sub-Indikator
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateCategoryMeta(0, {
                            hasSubIndicators: false,
                            categoryType: "DIRECT",
                          })
                        }
                        className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                          !activeEditModalData.cat.hasSubIndicators
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"
                        }`}
                      >
                        1 Indikator
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* BAGIAN 2: DETAIL INDIKATOR YANG SEDANG DISESUAIKAN (BOBOT, TARGET, SATUAN & KRITERIA) */}
              {activeEditModalData.currentParam && (
                <div className="rounded-xl border border-emerald-200 bg-white p-4 space-y-3.5 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                      2. Penyesuaian Indikator &amp; Kriteria Penilaian
                    </span>

                    {activeEditModalData.cat.hasSubIndicators &&
                      activeEditModalData.currentParam.isEnabled &&
                      activeEditModalData.cat.parameters.filter((p) => p.isEnabled).length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            toggleSubIndicatorFromDictionary(
                              activeEditModalData.catIdx,
                              activeEditModalData.currentParam!
                            )
                          }
                          className="h-7 px-2.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          Hapus Indikator
                        </button>
                      )}
                  </div>

                  {/* Dropdown Pilihan Sub-Indikator yang Disesuaikan */}
                  {activeEditModalData.cat.hasSubIndicators &&
                  activeEditModalData.cat.parameters.filter((p) => p.isEnabled).length > 0 ? (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Pilih Sub-Indikator
                      </label>
                      <select
                        value={activeEditModalData.currentParam.id}
                        onChange={(e) =>
                          setEditModalState((prev) =>
                            prev ? { ...prev, paramId: Number(e.target.value) } : null
                          )
                        }
                        className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-600 cursor-pointer"
                      >
                        {activeEditModalData.cat.parameters
                          .filter((p) => p.isEnabled)
                          .map((sub, sIdx) => (
                            <option key={sub.id} value={sub.id}>
                              1.{sIdx + 1} {sub.code ? `[${sub.code}] ` : ""}
                              {sub.name} ({sub.weight}%)
                            </option>
                          ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {activeEditModalData.currentParam.code && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] border border-slate-200">
                          {activeEditModalData.currentParam.code}
                        </span>
                      )}
                      <span className="font-bold text-slate-900 text-xs">
                        {activeEditModalData.currentParam.name}
                      </span>
                    </div>
                  )}

                  {/* Form Target, Satuan, & Bobot Sub-Indikator */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Target
                      </label>
                      <input
                        type="text"
                        value={activeEditModalData.currentParam.target}
                        onChange={(e) =>
                          updateParameterField(
                            activeEditModalData.catIdx,
                            activeEditModalData.currentParam!.id,
                            "target",
                            e.target.value
                          )
                        }
                        className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Satuan
                      </label>
                      <select
                        value={activeEditModalData.currentParam.unit || "%"}
                        onChange={(e) =>
                          updateParameterField(
                            activeEditModalData.catIdx,
                            activeEditModalData.currentParam!.id,
                            "unit",
                            e.target.value
                          )
                        }
                        className="w-full h-8 px-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:border-emerald-600 cursor-pointer"
                      >
                        {activeEditModalData.currentParam.unit &&
                          !SATUAN_OPTIONS.includes(
                            activeEditModalData.currentParam.unit
                          ) && (
                            <option value={activeEditModalData.currentParam.unit}>
                              {activeEditModalData.currentParam.unit}
                            </option>
                          )}
                        {SATUAN_OPTIONS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        {activeEditModalData.cat.hasSubIndicators
                          ? "Bobot Sub (%)"
                          : "Bobot Indikator (%)"}
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          disabled={!activeEditModalData.cat.hasSubIndicators}
                          value={
                            activeEditModalData.cat.hasSubIndicators
                              ? activeEditModalData.currentParam.weight
                              : 100
                          }
                          onChange={(e) =>
                            updateParameterField(
                              activeEditModalData.catIdx,
                              activeEditModalData.currentParam!.id,
                              "weight",
                              Number(e.target.value) || 0
                            )
                          }
                          className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-center text-slate-900 disabled:bg-slate-100 focus:outline-none focus:border-emerald-600"
                        />
                        <span className="text-xs font-semibold text-slate-500">%</span>
                      </div>
                    </div>
                  </div>

                  {/* Kriteria Penilaian (Rentang Pencapaian & Skor Nilai) */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-slate-500 px-0.5">
                      <div className="col-span-9">Kriteria / Rentang Pencapaian</div>
                      <div className="col-span-3 text-center">Skor Nilai</div>
                    </div>
                    {activeEditModalData.currentParam.scoringRules.map((b, bIdx) => (
                      <div key={bIdx} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-9">
                          <input
                            type="text"
                            value={b.label}
                            onChange={(e) =>
                              updateParameterBand(
                                activeEditModalData.catIdx,
                                activeEditModalData.currentParam!.id,
                                bIdx,
                                "label",
                                e.target.value
                              )
                            }
                            className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:border-emerald-600"
                          />
                        </div>
                        <div className="col-span-3">
                          <input
                            type="number"
                            value={b.score}
                            onChange={(e) =>
                              updateParameterBand(
                                activeEditModalData.catIdx,
                                activeEditModalData.currentParam!.id,
                                bIdx,
                                "score",
                                Number(e.target.value) || 0
                              )
                            }
                            className="w-full h-8 px-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-center text-slate-900 focus:outline-none focus:border-emerald-600"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* BAGIAN 3: PILIH / TAMBAH INDIKATOR DARI KAMUS PARAMETER KPI */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    3. Daftar Kamus Parameter KPI ({previewData.department.name})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {activeEditModalData.cat.hasSubIndicators
                      ? "Centang untuk memilih/menghapus"
                      : "Klik untuk mengganti indikator"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={editModalSearch}
                      onChange={(e) => setEditModalSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          editModalSearch.trim() &&
                          !activeEditModalData.allCandidates.some(
                            (c) =>
                              c.name.toLowerCase() ===
                              editModalSearch.trim().toLowerCase()
                          )
                        ) {
                          e.preventDefault();
                          void handleQuickAddToDictionary();
                        }
                      }}
                      placeholder="Cari atau ketik nama indikator baru..."
                      className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  {editModalSearch.trim() &&
                    !activeEditModalData.allCandidates.some(
                      (c) =>
                        c.name.toLowerCase() ===
                        editModalSearch.trim().toLowerCase()
                    ) && (
                      <button
                        type="button"
                        disabled={isAddingToDictionary}
                        onClick={() => void handleQuickAddToDictionary()}
                        className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {isAddingToDictionary ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>Tambah ke Kamus</span>
                      </button>
                    )}
                </div>

                {activeEditModalData.allCandidates.length === 0 &&
                  editModalSearch.trim() && (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center">
                      <p className="text-xs text-slate-600">
                        Indikator{" "}
                        <strong>&ldquo;{editModalSearch.trim()}&rdquo;</strong>{" "}
                        belum ada di Kamus Parameter ({previewData.department.name}
                        ). Klik <strong>Tambah ke Kamus</strong> di kanan atas
                        untuk menyimpan
                        {currentTargetEmployeeObj
                          ? ` khusus ${currentTargetEmployeeObj.name}`
                          : ""}
                        .
                      </p>
                    </div>
                  )}

                <div className="space-y-1.5">
                  {activeEditModalData.allCandidates.map((cand) => {
                    const inCat = activeEditModalData.cat.parameters.find(
                      (p) => p.id === cand.id
                    );
                    const isChecked = Boolean(inCat?.isEnabled);
                    const isCurrentSingle =
                      activeEditModalData.currentParam?.id === cand.id &&
                      isChecked;

                    if (activeEditModalData.cat.hasSubIndicators) {
                      return (
                        <div
                          key={cand.id}
                          onClick={() => {
                            toggleSubIndicatorFromDictionary(
                              activeEditModalData.catIdx,
                              cand
                            );
                            if (!isChecked) {
                              setEditModalState((prev) =>
                                prev ? { ...prev, paramId: cand.id } : null
                              );
                            }
                          }}
                          className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                            isChecked
                              ? "bg-emerald-50/80 border-emerald-300 text-slate-900 font-semibold"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                            />
                            {cand.code && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] border border-slate-200 shrink-0">
                                {cand.code}
                              </span>
                            )}
                            <span className="truncate">{cand.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isChecked && inCat && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditModalState((prev) =>
                                    prev ? { ...prev, paramId: cand.id } : null
                                  );
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                                  activeEditModalData.currentParam?.id === cand.id
                                    ? "bg-emerald-600 text-white border-emerald-600"
                                    : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                }`}
                              >
                                {inCat.weight}% • Detail
                              </button>
                            )}
                            <span className="text-[11px] text-slate-500 font-normal">
                              Target: <strong>{cand.target}</strong> ({cand.unit})
                            </span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={cand.id}
                        onClick={() => {
                          replaceSingleIndicatorFromMaster(
                            activeEditModalData.catIdx,
                            activeEditModalData.currentParam?.id || 0,
                            cand.id
                          );
                          setEditModalState((prev) =>
                            prev ? { ...prev, paramId: cand.id } : null
                          );
                        }}
                        className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isCurrentSingle
                            ? "bg-emerald-50/80 border-emerald-300 text-emerald-950 font-semibold"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="radio"
                            checked={isCurrentSingle}
                            onChange={() => {}}
                            className="text-emerald-600 focus:ring-emerald-600"
                          />
                          {cand.code && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] border border-slate-200 shrink-0">
                              {cand.code}
                            </span>
                          )}
                          <span className="truncate">{cand.name}</span>
                        </div>
                        <span className="text-[11px] text-slate-500 shrink-0 font-normal">
                          Target: <strong>{cand.target}</strong> ({cand.unit})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer Right Side Drawer */}
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2 shrink-0">
              <div className="text-[11px] text-slate-600">
                {activeEditModalData.cat.hasSubIndicators ? (
                  <span>
                    Terpilih:{" "}
                    <strong className="text-emerald-700">
                      {
                        activeEditModalData.cat.parameters.filter(
                          (p) => p.isEnabled
                        ).length
                      }{" "}
                      Sub-Indikator
                    </strong>
                  </span>
                ) : (
                  <span>Mode: Penilaian Langsung (1 Indikator)</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeEditModalData.cat.hasSubIndicators &&
                  activeEditModalData.cat.parameters.filter((p) => p.isEnabled)
                    .length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        distributeSubIndicatorWeightsEvenly(
                          activeEditModalData.catIdx
                        )
                      }
                      className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 transition-colors cursor-pointer"
                    >
                      Bagi Rata Bobot
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => setEditModalState(null)}
                  className="h-8 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Simpan / Selesai
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= RIGHT SIDE DRAWER 2: KRITERIA PENILAIAN (SKOR) ================= */}
      {activeCriteriaParam && (
        <div
          className="fixed inset-0 z-[80] flex justify-end bg-slate-900/35 backdrop-blur-[1px]"
          onClick={() => setCriteriaModalTarget(null)}
        >
          <div
            className="relative w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Kriteria Penilaian Indikator
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {activeCriteriaParam.param.name} ({activeCriteriaParam.categoryName})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCriteriaModalTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
              <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-slate-500 px-1">
                <div className="col-span-9">Kriteria / Rentang Pencapaian</div>
                <div className="col-span-3 text-center">Skor Nilai</div>
              </div>
              {activeCriteriaParam.param.scoringRules.map((b, bIdx) => (
                <div key={bIdx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-9">
                    <input
                      type="text"
                      value={b.label}
                      onChange={(e) =>
                        updateParameterBand(
                          activeCriteriaParam.catIdx,
                          activeCriteriaParam.param.id,
                          bIdx,
                          "label",
                          e.target.value
                        )
                      }
                      className="w-full h-8 px-2.5 rounded-lg border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      value={b.score}
                      onChange={(e) =>
                        updateParameterBand(
                          activeCriteriaParam.catIdx,
                          activeCriteriaParam.param.id,
                          bIdx,
                          "score",
                          Number(e.target.value) || 0
                        )
                      }
                      className="w-full h-8 px-2 rounded-lg border border-slate-300 text-xs font-bold text-center text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setCriteriaModalTarget(null)}
                className="h-8 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Simpan / Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= SUB-MODAL 3: VIEW & INLINE EDIT FORM MASTER TEMPLATE KPI ================= */}
      {viewingTemplateBundle && (
        <TemplateViewModal
          isOpen={true}
          onClose={() => setViewingEmployeeId(null)}
          template={viewingTemplateBundle.template}
          department={viewingTemplateBundle.department}
          jobLevel={viewingTemplateBundle.jobLevel}
          employee={viewingTemplateBundle.employee}
          categories={viewingTemplateBundle.categories}
          parameters={viewingTemplateBundle.parameters}
          bands={viewingTemplateBundle.bands}
          onOpenStep2ForEmployee={() => {
            if (viewingEmployeeId !== null) {
              setActiveEmployeeTarget(String(viewingEmployeeId));
              setViewingEmployeeId(null);
              setStep(2);
            }
          }}
          onUpdateCategory={async (catId, data) => {
            const catIdx = catId - 1;
            if (data.name !== undefined) {
              updateCategoryMeta(catIdx, { categoryName: data.name });
            }
            if (data.weight !== undefined) {
              updateCategoryWeight(catIdx, data.weight);
            }
          }}
          onUpdateIndicatorName={async (ind, newName) => {
            const catIdx = ind.categoryId - 1;
            updateParameterField(catIdx, ind.id, "name", newName);
          }}
          onUpdateIndicatorWeight={async (ind, newWeight) => {
            const catIdx = ind.categoryId - 1;
            updateParameterField(catIdx, ind.id, "weight", newWeight);
          }}
          onDeleteIndicator={async (ind) => {
            const catIdx = ind.categoryId - 1;
            const cat = activeCategories[catIdx];
            const found = cat?.parameters.find((p) => p.id === ind.id);
            if (found) {
              toggleSubIndicatorFromDictionary(catIdx, found);
            }
          }}
          onAddIndicator={(catId) => {
            const catIdx = catId - 1;
            setEditModalSearch("");
            setEditModalState({
              catIdx,
              paramId: activeCategories[catIdx]?.parameters[0]?.id || 0,
              activeTab: "MANAGE_SUBS",
            });
          }}
          onEditIndicator={(catId, ind) => {
            const catIdx = catId - 1;
            setEditModalSearch("");
            setEditModalState({
              catIdx,
              paramId: ind.id,
              activeTab: "EDIT_ITEM",
            });
          }}
          onUpdateCriteriaBandInline={async (band, data) => {
            const paramId = band.parameterId;
            const bandIdx = band.id % 1000;
            const catIdx = activeCategories.findIndex((c) =>
              c.parameters.some((p) => p.id === paramId)
            );
            if (catIdx === -1) return;
            if (data.label !== undefined) {
              updateParameterBand(catIdx, paramId, bandIdx, "label", data.label);
            }
            if (data.score !== undefined) {
              updateParameterBand(
                catIdx,
                paramId,
                bandIdx,
                "score",
                Number(data.score) || 0
              );
            }
          }}
        />
      )}

      {/* ================= RIGHT SIDE DRAWER 4: PANDUAN PENGGUNAAN GENERATE TEMPLATE & KAMUS PARAMETER ================= */}
      {showGuideModal && (
        <div
          className="fixed inset-0 z-[120] flex justify-end bg-slate-900/40 backdrop-blur-[1px]"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Panduan Generate Template &amp; Kustomisasi Kamus KPI
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Cara menyusun indikator standar maupun indikator unik per karyawan (misal: Karyawan A)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-5 space-y-3.5 overflow-y-auto text-xs text-slate-700">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-[11px] font-bold inline-flex items-center justify-center">
                    1
                  </span>
                  <span>Pilih Departemen, Job Category, &amp; Daftar Karyawan</span>
                </div>
                <p className="text-[11px] text-slate-600 pl-7 leading-relaxed">
                  Pada Tahap 1, pilih Departemen dan Job Category untuk memuat daftar karyawan hasil mapping beserta kamus indikator standar departemen.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-1.5">
                <div className="font-bold text-emerald-950 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold inline-flex items-center justify-center">
                    2
                  </span>
                  <span>Kustomisasi Unik per Karyawan (Contoh: Khusus Karyawan A)</span>
                </div>
                <p className="text-[11px] text-emerald-900 pl-7 leading-relaxed">
                  Pada Tahap 2, gunakan dropdown <strong>Template KPI Atas Nama</strong> di bagian atas:
                </p>
                <ul className="pl-11 list-disc space-y-1 text-[11px] text-emerald-900">
                  <li>
                    Pilih <strong>Semua Karyawan Terpilih</strong> jika ingin mengubah susunan indikator untuk seluruh karyawan sekaligus.
                  </li>
                  <li>
                    Pilih <strong>Nama Karyawan Tertentu (misal: Abdul Goni / Karyawan A)</strong> agar penambahan, penghapusan, atau perubahan bobot indikator <strong>hanya berlaku unik pada karyawan tersebut</strong> tanpa mengubah template karyawan lain.
                  </li>
                </ul>
              </div>

              <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 space-y-1.5">
                <div className="font-bold text-blue-950 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold inline-flex items-center justify-center">
                    3
                  </span>
                  <span>Tambah Indikator Baru ke Kamus Parameter (+ Tambah ke Kamus)</span>
                </div>
                <p className="text-[11px] text-blue-900 pl-7 leading-relaxed">
                  Jika indikator yang dibutuhkan karyawan belum ada di daftar <strong>Pilih Indikator Kamus</strong>:
                </p>
                <ul className="pl-11 list-disc space-y-1 text-[11px] text-blue-900">
                  <li>
                    Ketik nama indikator baru pada kolom pencarian (contoh: <em>Perbaikan tyre</em>).
                  </li>
                  <li>
                    Klik tombol <strong>+ Tambah ke Kamus</strong> di sebelah kolom pencarian.
                  </li>
                  <li>
                    Indikator tersebut otomatis tersimpan ke <strong>Kamus Parameter KPI</strong> departemen dan langsung terpasang <strong>khusus untuk karyawan yang sedang dipilih</strong>.
                  </li>
                </ul>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-[11px] font-bold inline-flex items-center justify-center">
                    4
                  </span>
                  <span>Bagi Rata Bobot &amp; Simpan Template KPI</span>
                </div>
                <p className="text-[11px] text-slate-600 pl-7 leading-relaxed">
                  Klik <strong>Bagi Rata Bobot</strong> agar total bobot internal sub-indikator Target Kerja otomatis menjadi 100%, lalu lanjut ke Tahap 3 untuk menyimpan KPI per karyawan atau sekaligus.
                </p>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="h-8 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
