"use client";

import React, { useState, useMemo } from "react";
import Swal from "sweetalert2";
import { KpiEditMonthModal, type EditMonthData } from "./kpi-edit-month-modal";
import { KpiAddParameterModal } from "./kpi-add-parameter-modal";
import { KpiAddIndicatorModal } from "./kpi-add-indicator-modal";
import { KpiEditIndicatorModal } from "./kpi-edit-indicator-modal";
import { KpiMonthlyDrawerModal } from "./kpi-monthly-drawer-modal";
import {
  saveMonthlyRealizationModal,
  addCustomParameterToAppraisal,
  addCustomIndicatorToAppraisal,
} from "@/lib/actions";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type ParameterStatus = "Belum Diisi" | "In Progress" | "Completed" | "Approved";

export interface CriterionItem {
  label: string;
  operator?: string;
  minValue?: number | null;
  maxValue?: number | null;
  score: number;
}

export interface KpiDetailItem {
  id: string | number;
  dbParameterId?: number;
  code: string; // e.g. "1.1"
  name: string; // e.g. "Rasio Deadstock"
  description?: string;
  target: number;
  targetDisplay: string;
  unit: string;
  weightInParameter: number; // e.g. 25%
  aggregation: "AVERAGE" | "SUM" | "LAST_VALUE";
  compareBasis?: "ACTUAL" | "ACHIEVEMENT";
  criteria: CriterionItem[];
  monthlyActuals: { [monthIndex: number]: number | null }; // 0..11
  monthlyNotes: { [monthIndex: number]: string };
  monthlyAttachments?: { [monthIndex: number]: string };
  manualActual?: number | null;
  manualScore?: number | null;
  manualSkorAkhir?: number | null;
}

export interface KpiParameterGroup {
  id: string | number;
  dbCategoryId?: number;
  number: number; // 1, 2, 3...
  name: string; // e.g. "Target Kerja"
  weight: number; // e.g. 65 (65%)
  kpis: KpiDetailItem[];
}

export interface EmployeeInfo {
  id?: number;
  nik: string;
  name: string;
  department: string;
  jobPosition: string;
  jobLevel?: string;
  appraiserName?: string;
  periodYear: number;
}

interface KpiCollapsibleInputProps {
  appraisalId?: number;
  employee: EmployeeInfo;
  initialParameters: KpiParameterGroup[];
  initialStatus?: "Draft" | "In Progress" | "Submitted" | "Approved";
  isLocked?: boolean;
  onSaveDraft?: (params: KpiParameterGroup[], overallScore: number) => void;
  onSubmitPenilaian?: (params: KpiParameterGroup[], overallScore: number) => void;
}

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// Helper untuk format angka rapi
function formatNumber(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "-";
  return Number.isInteger(val) ? val.toLocaleString("id-ID") : val.toFixed(1);
}

// Helper mengecek band kriteria yang cocok
export function getMatchedBand(val: number | null, criteria: CriterionItem[]): CriterionItem | null {
  if (val === null || isNaN(val)) return null;
  for (const c of criteria) {
    const min = c.minValue;
    const max = c.maxValue;
    const op = c.operator || "LTE";
    if (op === "LTE" && max !== null && max !== undefined && val <= max) return c;
    if (op === "LT" && max !== null && max !== undefined && val < max) return c;
    if (op === "GTE" && min !== null && min !== undefined && val >= min) return c;
    if (op === "GT" && min !== null && min !== undefined && val > min) return c;
    if (op === "EQ" && min !== null && min !== undefined && Math.abs(val - min) < 0.001) return c;
    if (op === "BETWEEN" && min !== null && max !== null && min !== undefined && max !== undefined) {
      if (val >= min && val <= max) return c;
    }
  }
  return criteria.length > 0 ? criteria[criteria.length - 1] : null;
}

export function KpiCollapsibleInput({
  appraisalId,
  employee,
  initialParameters,
  initialStatus = "Draft",
  isLocked = false,
  onSaveDraft,
  onSubmitPenilaian,
}: KpiCollapsibleInputProps) {
  // State Utama: Parameter Groups
  const [parameters, setParameters] = useState<KpiParameterGroup[]>(initialParameters);

  // Accordion State: Hanya satu parameter terbuka pada satu waktu (DEFAULT: COLLAPSED)
  const [expandedParamId, setExpandedParamId] = useState<string | number | null>(null);

  // Status Evaluasi Penilaian
  const [status, setStatus] = useState<string>(initialStatus);

  // Modal State untuk Edit Realisasi Bulan
  const [editModalData, setEditModalData] = useState<EditMonthData | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Modal State untuk Drawer 12 Bulan
  const [drawerKpi, setDrawerKpi] = useState<KpiDetailItem | null>(null);
  const [drawerGroupName, setDrawerGroupName] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Modal State untuk Tambah Parameter Baru
  const [isAddParamOpen, setIsAddParamOpen] = useState(false);

  // Modal State untuk Tambah Indikator Baru
  const [addIndicatorGroupId, setAddIndicatorGroupId] = useState<string | number | null>(null);
  const [addIndicatorGroupName, setAddIndicatorGroupName] = useState("");
  const [isAddIndicatorOpen, setIsAddIndicatorOpen] = useState(false);

  // Modal State untuk Edit Indikator KPI Lengkap
  const [editingIndicatorData, setEditingIndicatorData] = useState<{
    groupId: string | number;
    groupName: string;
    groupWeight: number;
    kpi: (KpiDetailItem & { annualActual?: number | null; score?: number; skorAkhirIndikator?: number }) | null;
  } | null>(null);

  // Toggle Accordion per Parameter (Single Open Behavior)
  const handleToggleAccordion = (paramId: string | number) => {
    setExpandedParamId((current) => (current === paramId ? null : paramId));
  };

  // State untuk Dropdown Inline Input 12 Bulan per KPI
  const [expandedKpiId, setExpandedKpiId] = useState<string | number | null>(null);

  const handleToggleKpiInline = (kpiId: string | number) => {
    setExpandedKpiId((current) => (current === kpiId ? null : kpiId));
  };

  // Handler: Update Nilai Aktual Bulan Secara Inline & Hitung Ulang Live
  const handleInlineMonthChange = (kpiId: string | number, monthIndex: number, newActual: number | null) => {
    setParameters((prevGroups) =>
      prevGroups.map((grp) => ({
        ...grp,
        kpis: grp.kpis.map((k) => {
          if (k.id === kpiId) {
            return {
              ...k,
              monthlyActuals: {
                ...k.monthlyActuals,
                [monthIndex]: newActual,
              },
            };
          }
          return k;
        }),
      }))
    );
  };

  // Handler: Simpan Perubahan Nilai Bulanan ke DB & Tampilkan Toast
  const handleSaveInlineKpi = async (groupName: string, kpi: KpiDetailItem) => {
    if (appraisalId && kpi.dbParameterId) {
      try {
        const promises = Object.entries(kpi.monthlyActuals).map(([mIdxStr, act]) => {
          const mIdx = Number(mIdxStr);
          return saveMonthlyRealizationModal({
            appraisalId,
            parameterId: kpi.dbParameterId!,
            monthIndex: mIdx,
            actual: act,
            note: kpi.monthlyNotes[mIdx] || "",
          });
        });
        await Promise.all(promises);
      } catch (err) {
        console.error("Gagal sync nilai bulanan ke DB:", err);
      }
    }

    const Toast = Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
    });
    Toast.fire({
      icon: "success",
      title: `Nilai realisasi bulanan "${kpi.name}" berhasil disimpan!`,
    });
  };

  // Open Drawer 12 Bulan
  const handleOpenDrawer = (groupName: string, kpi: KpiDetailItem) => {
    setDrawerGroupName(groupName);
    setDrawerKpi(kpi);
    setIsDrawerOpen(true);
  };

  // Open Edit Month Modal dari Drawer
  const handleOpenEditFromDrawer = (monthIndex: number) => {
    if (!drawerKpi) return;
    const currentActual = drawerKpi.monthlyActuals[monthIndex] ?? null;
    const currentNote = drawerKpi.monthlyNotes[monthIndex] ?? "";
    const currentAttachment = drawerKpi.monthlyAttachments?.[monthIndex] ?? null;

    setEditModalData({
      employeeName: employee.name,
      parameterName: drawerGroupName,
      kpiId: drawerKpi.id,
      kpiName: drawerKpi.name,
      monthIndex,
      monthName: MONTH_NAMES[monthIndex],
      year: employee.periodYear,
      target: drawerKpi.targetDisplay || drawerKpi.target,
      currentActual,
      unit: drawerKpi.unit,
      note: currentNote,
      attachmentName: currentAttachment,
    });
    setIsEditModalOpen(true);
  };

  // Save Month Modal
  const handleSaveMonthModal = async (payload: {
    kpiId: string | number;
    monthIndex: number;
    actual: number | null;
    note: string;
    attachmentName?: string | null;
  }) => {
    let targetDbParamId: number | undefined;

    setParameters((prevGroups) =>
      prevGroups.map((grp) => ({
        ...grp,
        kpis: grp.kpis.map((k) => {
          if (k.id === payload.kpiId) {
            targetDbParamId = k.dbParameterId;
            const updated = {
              ...k,
              monthlyActuals: {
                ...k.monthlyActuals,
                [payload.monthIndex]: payload.actual,
              },
              monthlyNotes: {
                ...k.monthlyNotes,
                [payload.monthIndex]: payload.note,
              },
              monthlyAttachments: {
                ...(k.monthlyAttachments || {}),
                [payload.monthIndex]: payload.attachmentName || "",
              },
            };
            // Jika drawer sedang terbuka untuk kpi ini, update drawerKpi juga
            if (drawerKpi && drawerKpi.id === k.id) {
              setDrawerKpi(updated);
            }
            return updated;
          }
          return k;
        }),
      }))
    );

    if (appraisalId && targetDbParamId) {
      try {
        await saveMonthlyRealizationModal({
          appraisalId,
          parameterId: targetDbParamId,
          monthIndex: payload.monthIndex,
          actual: payload.actual,
          note: payload.note,
        });
      } catch (err) {
        console.error("Gagal sync ke database:", err);
      }
    }

    const Toast = Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 1500,
    });
    Toast.fire({
      icon: "success",
      title: `Nilai ${MONTH_NAMES[payload.monthIndex]} tersimpan & dihitung otomatis!`,
    });
  };

  // Handler: Tambah Parameter Baru
  const handleAddParameter = async (payload: { name: string; weight: number; applyToMaster: boolean }) => {
    const newId = `param-custom-${Date.now()}`;
    const nextNumber = parameters.length + 1;

    let dbCatId: number | undefined;
    try {
      const res = await addCustomParameterToAppraisal({
        appraisalId,
        name: payload.name,
        weight: payload.weight,
        applyToMaster: payload.applyToMaster,
      });
      if (res.success && res.categoryId) {
        dbCatId = res.categoryId;
      }
    } catch (e) {
      console.error(e);
    }

    const newGroup: KpiParameterGroup = {
      id: newId,
      dbCategoryId: dbCatId,
      number: nextNumber,
      name: payload.name,
      weight: payload.weight,
      kpis: [],
    };

    setParameters((prev) => [...prev, newGroup]);
    setExpandedParamId(newId);

    Swal.fire({
      icon: "success",
      title: "Parameter Baru Ditambahkan!",
      text: `Kelompok "${payload.name}" (${payload.weight}%) siap diisi indikator KPI.`,
      timer: 1600,
      showConfirmButton: false,
    });
  };

  // Handler: Tambah Indikator Baru
  const handleAddIndicator = async (payload: {
    parameterGroupId: string | number;
    name: string;
    description: string;
    target: number;
    unit: string;
    weightInParameter: number;
    aggregation: "AVERAGE" | "SUM" | "LAST_VALUE";
    criteria: CriterionItem[];
    applyToMaster: boolean;
  }) => {
    const targetGroup = parameters.find((g) => g.id === payload.parameterGroupId);
    if (!targetGroup) return;

    const newKpiCode = `${targetGroup.number}.${targetGroup.kpis.length + 1}`;
    const newKpiId = `kpi-custom-${Date.now()}`;

    let dbParamId: number | undefined;
    if (targetGroup.dbCategoryId) {
      try {
        const res = await addCustomIndicatorToAppraisal({
          appraisalId,
          categoryId: targetGroup.dbCategoryId,
          name: payload.name,
          description: payload.description,
          target: payload.target,
          unit: payload.unit,
          weight: payload.weightInParameter,
          aggregation: payload.aggregation,
          criteria: payload.criteria,
          applyToMaster: payload.applyToMaster,
        });
        if (res.success && res.parameterId) {
          dbParamId = res.parameterId;
        }
      } catch (e) {
        console.error(e);
      }
    }

    const newKpi: KpiDetailItem = {
      id: newKpiId,
      dbParameterId: dbParamId,
      code: newKpiCode,
      name: payload.name,
      description: payload.description,
      target: payload.target,
      targetDisplay: `${payload.target}${payload.unit === "%" ? "%" : ""}`,
      unit: payload.unit,
      weightInParameter: payload.weightInParameter,
      aggregation: payload.aggregation,
      compareBasis: "ACTUAL",
      criteria: payload.criteria,
      monthlyActuals: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null, 8: null, 9: null, 10: null, 11: null },
      monthlyNotes: {},
    };

    setParameters((prev) =>
      prev.map((g) => {
        if (g.id === payload.parameterGroupId) {
          return {
            ...g,
            kpis: [...g.kpis, newKpi],
          };
        }
        return g;
      })
    );

    Swal.fire({
      icon: "success",
      title: "Indikator KPI Ditambahkan!",
      text: `Indikator "${payload.name}" berhasil ditambahkan ke dalam ${targetGroup.name}.`,
      timer: 1600,
      showConfirmButton: false,
    });
  };

  // Handler: Edit Parameter
  const handleEditParameter = (group: KpiParameterGroup) => {
    Swal.fire({
      title: "Edit Parameter",
      html: `
        <div class="text-left text-xs space-y-3 pt-2">
          <div>
            <label class="font-bold text-slate-700 block mb-1">Nama Parameter</label>
            <input id="swal-edit-param-name" class="swal2-input !m-0 !w-full !text-xs !h-9" value="${group.name}">
          </div>
          <div>
            <label class="font-bold text-slate-700 block mb-1">Bobot Parameter (%)</label>
            <input id="swal-edit-param-weight" type="number" class="swal2-input !m-0 !w-full !text-xs !h-9" value="${group.weight}">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Simpan",
      cancelButtonText: "Batal",
      confirmButtonColor: "#0f172a",
      preConfirm: () => {
        const name = (document.getElementById("swal-edit-param-name") as HTMLInputElement).value.trim();
        const weight = parseFloat((document.getElementById("swal-edit-param-weight") as HTMLInputElement).value);
        if (!name) {
          Swal.showValidationMessage("Nama parameter wajib diisi");
          return false;
        }
        if (isNaN(weight) || weight <= 0) {
          Swal.showValidationMessage("Bobot harus lebih dari 0%");
          return false;
        }
        return { name, weight };
      },
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        const { name, weight } = result.value;
        setParameters((prev) =>
          prev.map((g) => (g.id === group.id ? { ...g, name, weight } : g))
        );
        Swal.fire({
          icon: "success",
          title: "Parameter Diperbarui",
          timer: 1400,
          showConfirmButton: false,
        });
      }
    });
  };

  // Handler: Hapus Parameter
  const handleDeleteParameter = (groupId: string | number, groupName: string) => {
    Swal.fire({
      title: `Hapus Parameter "${groupName}"?`,
      text: "Semua indikator di dalam kelompok parameter ini akan ikut terhapus.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#94a3b8",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    }).then((result) => {
      if (result.isConfirmed) {
        setParameters((prev) => prev.filter((g) => g.id !== groupId));
        if (expandedParamId === groupId) setExpandedParamId(null);
        Swal.fire({
          icon: "success",
          title: "Parameter Dihapus",
          timer: 1400,
          showConfirmButton: false,
        });
      }
    });
  };

  // Handler: Simpan Edit Indikator KPI (dari KpiEditIndicatorModal)
  const handleSaveEditIndicator = (payload: {
    groupId: string | number;
    kpiId: string | number;
    name: string;
    description: string;
    unit: string;
    target: number;
    targetDisplay: string;
    annualActual: number | null;
    criteria: CriterionItem[];
    score: number;
    weightInParameter: number;
    skorAkhirIndikator: number;
  }) => {
    setParameters((prev) =>
      prev.map((g) => {
        if (g.id === payload.groupId) {
          return {
            ...g,
            kpis: g.kpis.map((k) => {
              if (k.id === payload.kpiId) {
                return {
                  ...k,
                  name: payload.name,
                  description: payload.description,
                  unit: payload.unit,
                  target: payload.target,
                  targetDisplay: payload.targetDisplay,
                  manualActual: payload.annualActual,
                  criteria: payload.criteria,
                  manualScore: payload.score,
                  weightInParameter: payload.weightInParameter,
                  manualSkorAkhir: payload.skorAkhirIndikator,
                };
              }
              return k;
            }),
          };
        }
        return g;
      })
    );

    Swal.fire({
      icon: "success",
      title: "Indikator Diperbarui",
      text: `Indikator "${payload.name}" berhasil disimpan.`,
      timer: 1500,
      showConfirmButton: false,
    });
  };

  // Handler: Hapus Indikator KPI
  const handleDeleteIndicator = (groupId: string | number, kpiId: string | number, kpiName: string) => {
    Swal.fire({
      title: `Hapus Indikator "${kpiName}"?`,
      text: "Indikator dan riwayat nilai bulanan ini akan dihapus dari form penilaian.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#94a3b8",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    }).then((result) => {
      if (result.isConfirmed) {
        setParameters((prev) =>
          prev.map((g) => {
            if (g.id === groupId) {
              return {
                ...g,
                kpis: g.kpis.filter((k) => k.id !== kpiId),
              };
            }
            return g;
          })
        );
        if (expandedKpiId === kpiId) setExpandedKpiId(null);
        Swal.fire({
          icon: "success",
          title: "Indikator Dihapus",
          timer: 1400,
          showConfirmButton: false,
        });
      }
    });
  };

  // ============================================================================
  // RECALCULATE ENGINE & PERHITUNGAN LIVE (EXCEL FORMAT COMPLIANT)
  // ============================================================================

  const calculatedData = useMemo(() => {
    let grandOverallScore = 0;
    let totalFilledKpisCount = 0;
    let totalKpisCount = 0;

    const groupSummaries = parameters.map((grp) => {
      let groupScoreSum = 0;
      let groupFilledKpis = 0;

      const kpisCalculated = grp.kpis.map((kpi) => {
        totalKpisCount++;

        // 1. Hitung Annual Actual dari data bulanan (atau manual override jika diedit)
        const validValues = Object.entries(kpi.monthlyActuals)
          .map(([_, v]) => (v !== null && v !== undefined && !isNaN(v) ? v : null))
          .filter((v): v is number => v !== null);

        let annualActual: number | null = null;
        if (kpi.manualActual !== undefined && kpi.manualActual !== null) {
          annualActual = kpi.manualActual;
        } else if (validValues.length > 0) {
          if (kpi.aggregation === "SUM") {
            annualActual = validValues.reduce((s, val) => s + val, 0);
          } else if (kpi.aggregation === "LAST_VALUE") {
            annualActual = validValues[validValues.length - 1];
          } else {
            // AVERAGE
            annualActual = parseFloat(
              (validValues.reduce((s, val) => s + val, 0) / validValues.length).toFixed(1)
            );
          }
        }

        // 2. Hitung Achievement %
        let achievement: number | null = null;
        if (annualActual !== null && kpi.target > 0) {
          achievement = Math.round((annualActual / kpi.target) * 100);
        }

        // 3. Band Matching & Raw Score (Skala 25)
        let score = 0;
        let matchedBand: CriterionItem | null = null;
        if (kpi.manualScore !== undefined && kpi.manualScore !== null) {
          score = kpi.manualScore;
          matchedBand = getMatchedBand(annualActual, kpi.criteria);
        } else {
          const basis = kpi.compareBasis === "ACHIEVEMENT" ? achievement : annualActual;
          matchedBand = basis !== null ? getMatchedBand(basis, kpi.criteria) : null;
          score = matchedBand ? matchedBand.score : 0;
        }

        const isFilled =
          validValues.length > 0 ||
          (kpi.manualActual !== undefined && kpi.manualActual !== null) ||
          (kpi.manualScore !== undefined && kpi.manualScore !== null);

        if (isFilled) {
          groupFilledKpis++;
          totalFilledKpisCount++;
        }

        // 4. Hitung Skor Akhir Indikator (Persis seperti format Excel Gambar 2):
        // Formula Excel: (Skor / 25) * (Bobot Indikator / 100) * Bobot Kategori
        const kpiWeightPercent = kpi.weightInParameter || 20;
        let skorAkhirIndikator = 0;
        if (kpi.manualSkorAkhir !== undefined && kpi.manualSkorAkhir !== null) {
          skorAkhirIndikator = kpi.manualSkorAkhir;
        } else if (isFilled) {
          skorAkhirIndikator = Math.round((score / 25) * kpiWeightPercent * (grp.weight / 100));
        }

        groupScoreSum += skorAkhirIndikator;

        return {
          ...kpi,
          annualActual,
          achievement,
          matchedBand,
          score,
          skorAkhirIndikator,
          isFilled,
          filledMonthsCount: validValues.length,
        };
      });

      // Status Parameter
      let paramStatus: ParameterStatus = "Belum Diisi";
      if (status === "Approved") {
        paramStatus = "Approved";
      } else if (groupFilledKpis === grp.kpis.length && grp.kpis.length > 0) {
        paramStatus = "Completed";
      } else if (groupFilledKpis > 0) {
        paramStatus = "In Progress";
      }

      grandOverallScore += groupScoreSum;

      return {
        ...grp,
        kpis: kpisCalculated,
        filledKpis: groupFilledKpis,
        totalKpis: grp.kpis.length,
        progressLabel: `${groupFilledKpis}/${grp.kpis.length}`,
        scoreDisplay: `${groupScoreSum}%`,
        status: paramStatus,
      };
    });

    const overallPercentage = Math.min(100, Math.round(grandOverallScore));

    let grade = "C";
    if (overallPercentage >= 90) grade = "A (Sangat Baik)";
    else if (overallPercentage >= 80) grade = "B (Baik)";
    else if (overallPercentage < 70) grade = "D (Kurang)";

    return {
      groupSummaries,
      overallScore: overallPercentage,
      totalKpisCount,
      totalFilledKpisCount,
      grade,
    };
  }, [parameters, status]);

  // Simpan Draft
  const handleSaveDraft = () => {
    setStatus("Draft");
    if (onSaveDraft) onSaveDraft(parameters, calculatedData.overallScore);
    Swal.fire({
      icon: "success",
      title: "Draft Tersimpan!",
      text: "Seluruh nilai realisasi berhasil disimpan sebagai draft.",
      timer: 1500,
      showConfirmButton: false,
    });
  };

  // Submit Penilaian
  const handleSubmitPenilaian = () => {
    Swal.fire({
      title: "Submit Penilaian KPI?",
      html: `<div class="text-xs text-sky-900 text-left space-y-1">
        <p>Karyawan: <b>${employee.name}</b> (${employee.jobPosition})</p>
        <p>Total Skor Akhir: <b>${calculatedData.overallScore}% (${calculatedData.grade})</b></p>
      </div>`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#0284c7",
      cancelButtonColor: "#94a3b8",
      confirmButtonText: "Ya, Submit Sekarang",
      cancelButtonText: "Batal",
    }).then((res) => {
      if (res.isConfirmed) {
        setStatus("Submitted");
        if (onSubmitPenilaian) onSubmitPenilaian(parameters, calculatedData.overallScore);
        Swal.fire({
          icon: "success",
          title: "Berhasil Disubmit!",
          text: "Penilaian KPI dikirimkan ke atasan penilai.",
          timer: 1800,
          showConfirmButton: false,
        });
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* DAFTAR PARAMETER ACCORDION (CLEAN WHITE + TOMBOL BIRU MUDA) */}
      <div className="space-y-3">
        {/* Header Section dengan Tombol Tambah Parameter */}
        <div className="flex items-center justify-between px-1">
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base tracking-tight">
              Parameter &amp; Indikator Penilaian KPI
            </h3>
            <p className="text-xs text-slate-500">
              Klik baris parameter untuk melihat tabel format kriteria, realisasi, dan skor akhir.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsAddParamOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition shadow-2xs cursor-pointer"
          >
            <span className="text-sm font-bold text-slate-500">+</span>
            <span>Tambah Parameter</span>
          </button>
        </div>

        {/* List Parameter Groups */}
        <div className="space-y-3">
          {calculatedData.groupSummaries.map((group) => {
            const isExpanded = expandedParamId === group.id;

            return (
              <div
                key={group.id}
                className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden transition-all duration-150"
              >
                {/* ------------------------------------------------------------- */}
                {/* MAIN KPI SUMMARY ROW (ACCORDION HEADER - CLEAN & MINIMALIST)  */}
                {/* ------------------------------------------------------------- */}
                <div
                  onClick={() => handleToggleAccordion(group.id)}
                  className={`p-4 sm:p-4.5 flex items-center justify-between gap-4 cursor-pointer select-none transition ${
                    isExpanded ? "bg-slate-50/80 border-b border-slate-200" : "bg-white hover:bg-slate-50/70"
                  }`}
                >
                  {/* Left: Number & Parameter Name */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-black transition ${
                        isExpanded
                          ? "bg-slate-900 text-white shadow-2xs"
                          : "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {group.number}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-extrabold text-slate-900 text-sm sm:text-base tracking-tight truncate">
                          {group.name}
                        </h4>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                            group.status === "Completed"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : group.status === "In Progress"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          ● {group.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                        <span>Bobot: <strong className="text-slate-800 font-semibold">{group.weight}%</strong></span>
                        <span>•</span>
                        <span>Jumlah KPI: <strong className="text-slate-800 font-semibold">{group.totalKpis}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Progress, Score, Edit ✏️, Hapus 🗑️ & Detail / Close ✕ (Tanpa Card) */}
                  <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                    <div className="text-right hidden sm:block">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Progress
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-800">
                        {group.progressLabel} KPI
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Score
                      </span>
                      <span className="text-sm font-black font-mono text-slate-900">
                        {group.scoreDisplay}
                      </span>
                    </div>

                    <div className="flex items-center">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                      >
                        {isExpanded ? (
                          <>
                            <span className="text-slate-400 font-bold text-xs">✕</span>
                            <span>Tutup</span>
                          </>
                        ) : (
                          <>
                            <span>Detail</span>
                            <span className="text-slate-400 text-xs">▾</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* ------------------------------------------------------------- */}
                {/* EXPANDED VIEW: TABEL DETAIL FORMAT EXCEL (CLEAN NEUTRAL)      */}
                {/* ------------------------------------------------------------- */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 bg-white space-y-4 animate-in fade-in duration-150">
                    {/* Inner Parameter Subheader */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex-wrap gap-2">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span>
                          Grup: <strong className="text-slate-900 font-bold">{group.name}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Bobot Parameter: <strong className="text-slate-900 font-bold">{group.weight}%</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Progress Input:{" "}
                          <strong className="text-emerald-700 font-bold font-mono">
                            {group.progressLabel} selesai
                          </strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleEditParameter(group)}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline px-1 py-0.5 text-xs font-semibold transition cursor-pointer"
                          title="Edit Parameter"
                        >
                          <svg className="w-3.5 h-3.5 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            <path d="m15 5 4 4" />
                          </svg>
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteParameter(group.id, group.name)}
                          className="inline-flex items-center gap-1 text-red-500 hover:text-red-600 hover:underline px-1 py-0.5 text-xs font-semibold transition cursor-pointer"
                          title="Delete Parameter"
                        >
                          <svg className="w-3.5 h-3.5 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            <line x1="10" x2="10" y1="11" y2="17" />
                            <line x1="14" x2="14" y1="11" y2="17" />
                          </svg>
                          <span>Delete</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setAddIndicatorGroupId(group.id);
                            setAddIndicatorGroupName(group.name);
                            setIsAddIndicatorOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
                        >
                          <span className="font-bold text-slate-500">+</span>
                          <span>Tambah Indikator</span>
                        </button>
                      </div>
                    </div>

                    {/* Tabel Format Excel: Parameter | Kriteria | Target | Realisasi | Skor | Bobot | Skor Akhir | Aksi */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                            <th className="p-3 text-left w-52">Parameter / Indikator</th>
                            <th className="p-3 text-left w-60">Kriteria Penilaian</th>
                            <th className="p-3 text-center w-24">Target</th>
                            <th className="p-3 text-center w-24 font-bold">Realisasi</th>
                            <th className="p-3 text-center w-20 font-bold">Skor</th>
                            <th className="p-3 text-center w-20 font-bold">Bobot</th>
                            <th className="p-3 text-center w-24 font-bold">Skor Akhir</th>
                            <th className="p-3 text-center w-60">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150">
                          {group.kpis.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="p-6 text-center text-slate-500 italic">
                                Belum ada indikator KPI pada parameter ini. Silakan klik tombol "+ Tambah Indikator".
                              </td>
                            </tr>
                          ) : (
                            group.kpis.map((kpi) => {
                              const isKpiExpanded = expandedKpiId === kpi.id;

                              return (
                                <React.Fragment key={kpi.id}>
                                  <tr className={`hover:bg-slate-50/60 transition ${isKpiExpanded ? "bg-slate-50/40" : ""}`}>
                                    {/* No & Nama KPI */}
                                    <td className="p-3 align-middle">
                                      <div className="font-extrabold text-slate-900 text-xs">
                                        {kpi.code} {kpi.name}
                                      </div>
                                      {kpi.description && (
                                        <div className="text-[11px] text-slate-500 truncate max-w-xs mt-0.5">
                                          {kpi.description}
                                        </div>
                                      )}
                                      {kpi.unit && (
                                        <span className="inline-block mt-1 text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                          Satuan: {kpi.unit}
                                        </span>
                                      )}
                                    </td>

                                    {/* Kriteria Penilaian (Tiers 25, 15, 5 persis seperti Excel Gambar 2) */}
                                    <td className="p-2.5 align-middle">
                                      <div className="space-y-1">
                                        {kpi.criteria.map((c, cIdx) => {
                                          const isMatched = kpi.matchedBand?.label === c.label;
                                          return (
                                            <div
                                              key={cIdx}
                                              className={`flex items-center justify-between px-2 py-0.5 rounded text-[11px] border font-mono transition ${
                                                isMatched
                                                  ? "bg-amber-50 text-amber-950 border-amber-300 font-bold shadow-2xs"
                                                  : "bg-white text-slate-700 border-slate-200"
                                              }`}
                                            >
                                              <span className="truncate">{c.label}</span>
                                              <span className="font-bold shrink-0 ml-2">{c.score}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </td>

                                    {/* Target */}
                                    <td className="p-3 text-center align-middle font-mono font-bold text-slate-800 text-xs">
                                      {kpi.targetDisplay || formatNumber(kpi.target)}
                                    </td>

                                    {/* Realisasi (Annual Actual) */}
                                    <td className="p-3 text-center align-middle font-mono font-bold text-slate-900 text-xs">
                                      {kpi.annualActual !== null ? (
                                        <span className="px-2 py-1 rounded bg-slate-100 border border-slate-200 shadow-2xs inline-block">
                                          {formatNumber(kpi.annualActual)}
                                          {kpi.unit === "%" ? "%" : ""}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 italic">Belum diisi</span>
                                      )}
                                    </td>

                                    {/* Skor */}
                                    <td className="p-3 text-center align-middle font-mono font-black text-slate-900 text-sm">
                                      {kpi.isFilled ? (
                                        <span className="text-slate-900 font-bold">{kpi.score}</span>
                                      ) : (
                                        <span className="text-slate-400">-</span>
                                      )}
                                    </td>

                                    {/* Bobot KPI dalam Parameter */}
                                    <td className="p-3 text-center align-middle font-mono font-medium text-slate-600 text-xs">
                                      {kpi.weightInParameter}%
                                    </td>

                                    {/* Skor Akhir Indikator (Persis Excel: Realisasi x Bobot) */}
                                    <td className="p-3 text-center align-middle font-mono font-black text-slate-900 text-xs">
                                      {kpi.isFilled ? (
                                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 inline-block font-bold">
                                          {kpi.skorAkhirIndikator}%
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">-</span>
                                      )}
                                    </td>

                                    {/* Tombol Aksi: Input Bulanan, Edit (Blue Icon), Delete (Red Icon) */}
                                    <td className="p-3 text-center align-middle">
                                      <div className="flex items-center justify-center gap-2.5">
                                        <button
                                          type="button"
                                          onClick={() => handleToggleKpiInline(kpi.id)}
                                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                                            isKpiExpanded
                                              ? "text-rose-600 hover:bg-rose-50"
                                              : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                                          }`}
                                          title={isKpiExpanded ? "Tutup input bulanan" : "Buka input 12 bulan"}
                                        >
                                          {isKpiExpanded ? (
                                            <>
                                              <span className="text-rose-500 font-bold text-xs">✕</span>
                                              <span>Tutup</span>
                                            </>
                                          ) : (
                                            <>
                                              <span>📅</span>
                                              <span>Input</span>
                                            </>
                                          )}
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            setEditingIndicatorData({
                                              groupId: group.id,
                                              groupName: group.name,
                                              groupWeight: group.weight,
                                              kpi,
                                            })
                                          }
                                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline px-1 py-0.5 text-xs font-semibold transition cursor-pointer"
                                          title="Edit Indikator KPI"
                                        >
                                          <svg className="w-3.5 h-3.5 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                            <path d="m15 5 4 4" />
                                          </svg>
                                          <span>Edit</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => handleDeleteIndicator(group.id, kpi.id, kpi.name)}
                                          className="inline-flex items-center gap-1 text-red-500 hover:text-red-600 hover:underline px-1 py-0.5 text-xs font-semibold transition cursor-pointer"
                                          title="Delete Indikator KPI"
                                        >
                                          <svg className="w-3.5 h-3.5 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 6h18" />
                                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                            <line x1="10" x2="10" y1="11" y2="17" />
                                            <line x1="14" x2="14" y1="11" y2="17" />
                                          </svg>
                                          <span>Delete</span>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* Dropdown Inline Input 12 Bulan tepat di bawah baris KPI */}
                                  {isKpiExpanded && (
                                    <tr className="bg-slate-50/70 border-b border-slate-200 animate-in fade-in duration-150">
                                      <td colSpan={8} className="p-4 sm:p-5">
                                        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
                                          {/* Header Panel Input Bulanan */}
                                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                                            <div className="flex items-center gap-2 flex-wrap text-xs">
                                              <span className="font-extrabold text-slate-900">
                                                Input Realisasi 12 Bulan — {kpi.name}
                                              </span>
                                              <span className="text-slate-300">•</span>
                                              <span className="text-slate-600">
                                                Target: <strong className="font-mono text-slate-900">{kpi.targetDisplay || kpi.target} {kpi.unit}</strong>
                                              </span>
                                              <span className="text-slate-300">•</span>
                                              <span className="text-slate-600">
                                                Metode: <strong className="font-semibold text-slate-900">{kpi.aggregation}</strong>
                                              </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                              <button
                                                type="button"
                                                onClick={() => handleOpenDrawer(group.name, kpi)}
                                                className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1"
                                                title="Buka rincian lengkap beserta catatan & upload file"
                                              >
                                                <span>✎</span>
                                                <span>Catatan &amp; Bukti</span>
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleToggleKpiInline(kpi.id)}
                                                className="text-xs font-semibold text-slate-400 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition cursor-pointer flex items-center gap-1"
                                              >
                                                <span className="font-bold text-xs">✕</span>
                                                <span>Tutup</span>
                                              </button>
                                            </div>
                                          </div>

                                          {/* 12 Months Grid Inputs */}
                                          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-2">
                                            {MONTH_NAMES.map((mName, mIdx) => {
                                              const currentVal = kpi.monthlyActuals[mIdx];
                                              const isFilled = currentVal !== null && currentVal !== undefined;
                                              const hasNote = Boolean(kpi.monthlyNotes[mIdx]);
                                              const hasAtt = Boolean(kpi.monthlyAttachments?.[mIdx]);

                                              return (
                                                <div
                                                  key={mIdx}
                                                  className={`rounded-xl border p-2 text-center transition ${
                                                    isFilled
                                                      ? "border-slate-300 bg-slate-50/70"
                                                      : "border-slate-200 bg-white"
                                                  }`}
                                                >
                                                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1">
                                                    <span>{MONTH_SHORT[mIdx]}</span>
                                                    {(hasNote || hasAtt) && (
                                                      <span className="text-[10px] text-sky-600 cursor-help" title={kpi.monthlyNotes[mIdx] || "Ada lampiran"}>
                                                        {hasAtt ? "📎" : "✎"}
                                                      </span>
                                                    )}
                                                  </div>
                                                  <input
                                                    type="number"
                                                    step="any"
                                                    disabled={isLocked}
                                                    value={currentVal !== null && currentVal !== undefined ? currentVal : ""}
                                                    onChange={(e) => {
                                                      const val = e.target.value.trim() === "" ? null : parseFloat(e.target.value);
                                                      handleInlineMonthChange(kpi.id, mIdx, isNaN(val as number) ? null : val);
                                                    }}
                                                    placeholder="-"
                                                    className="w-full text-center rounded-lg border border-slate-200 bg-white py-1 px-1 text-xs font-mono font-bold text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 focus:outline-none transition"
                                                  />
                                                </div>
                                              );
                                            })}
                                          </div>

                                          {/* Inline Footer Summary & Quick Sync */}
                                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
                                            <div className="flex items-center gap-3 text-slate-600 flex-wrap">
                                              <span>
                                                Akumulasi Realisasi:{" "}
                                                <strong className="font-mono text-slate-900 font-bold">
                                                  {kpi.annualActual !== null ? `${formatNumber(kpi.annualActual)} ${kpi.unit}` : "-"}
                                                </strong>
                                              </span>
                                              <span>•</span>
                                              <span>
                                                Skor Kriteria:{" "}
                                                <strong className="font-mono text-slate-900 font-bold">
                                                  {kpi.score} pt
                                                </strong>
                                              </span>
                                              <span>•</span>
                                              <span>
                                                Skor Akhir:{" "}
                                                <strong className="font-mono text-emerald-700 font-bold">
                                                  {kpi.skorAkhirIndikator}%
                                                </strong>
                                              </span>
                                            </div>

                                            <button
                                              type="button"
                                              disabled={isLocked}
                                              onClick={() => handleSaveInlineKpi(group.name, kpi)}
                                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shadow-xs cursor-pointer self-end sm:self-auto"
                                            >
                                              <span>💾</span>
                                              <span>Simpan Perubahan</span>
                                            </button>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Bottom Buttons: Tambah Indikator & Tutup Parameter */}
                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAddIndicatorGroupId(group.id);
                          setAddIndicatorGroupName(group.name);
                          setIsAddIndicatorOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
                      >
                        <span className="font-bold text-slate-500">+</span>
                        <span>Tambah Indikator pada {group.name}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleAccordion(group.id)}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-800 py-1.5 px-3 rounded-lg hover:bg-slate-100 transition cursor-pointer flex items-center gap-1"
                      >
                        <span className="text-slate-400 font-bold text-xs">✕</span>
                        <span>Tutup {group.name}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Tombol Tambah Parameter di Bagian Bawah */}
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => setIsAddParamOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-dashed border-slate-300 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-semibold transition cursor-pointer shadow-2xs"
          >
            <span className="text-base font-bold text-slate-400">+</span>
            <span>Tambah Kelompok Parameter Baru</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 3. MODAL DRAWER 12 BULAN (JAN - DES)                                  */}
      {/* ===================================================================== */}
      <KpiMonthlyDrawerModal
        isOpen={isDrawerOpen}
        parameterGroupName={drawerGroupName}
        kpi={drawerKpi}
        onClose={() => setIsDrawerOpen(false)}
        onEditMonth={handleOpenEditFromDrawer}
        isLocked={isLocked}
      />

      {/* ===================================================================== */}
      {/* 4. MODAL EDIT REALISASI BULAN                                         */}
      {/* ===================================================================== */}
      <KpiEditMonthModal
        isOpen={isEditModalOpen}
        data={editModalData}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveMonthModal}
        isLocked={isLocked}
      />

      {/* ===================================================================== */}
      {/* 5. MODAL TAMBAH PARAMETER GROUP                                       */}
      {/* ===================================================================== */}
      <KpiAddParameterModal
        isOpen={isAddParamOpen}
        onClose={() => setIsAddParamOpen(false)}
        onAdd={handleAddParameter}
      />

      {/* ===================================================================== */}
      {/* 6. MODAL TAMBAH INDIKATOR KPI                                         */}
      {/* ===================================================================== */}
      <KpiAddIndicatorModal
        isOpen={isAddIndicatorOpen}
        parameterGroupId={addIndicatorGroupId || ""}
        parameterGroupName={addIndicatorGroupName}
        onClose={() => setIsAddIndicatorOpen(false)}
        onAdd={handleAddIndicator}
      />

      {/* ===================================================================== */}
      {/* 7. MODAL EDIT INDIKATOR KPI LENGKAP                                   */}
      {/* ===================================================================== */}
      {editingIndicatorData && (
        <KpiEditIndicatorModal
          isOpen={Boolean(editingIndicatorData)}
          groupId={editingIndicatorData.groupId}
          groupName={editingIndicatorData.groupName}
          groupWeight={editingIndicatorData.groupWeight}
          kpi={editingIndicatorData.kpi}
          onClose={() => setEditingIndicatorData(null)}
          onSave={handleSaveEditIndicator}
        />
      )}
    </div>
  );
}
