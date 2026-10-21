"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { KpiCollapsibleInput, type KpiParameterGroup } from "./kpi-collapsible-input";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type KpiStatus = "Draft" | "In Progress" | "Submitted" | "Under Review" | "Approved" | "Rejected";

export interface CriterionRule {
  label: string;
  operator: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN";
  threshold1: number;
  threshold2?: number;
  score: number;
}

export interface KpiParameterItem {
  id: string;
  code: string;
  name: string;
  category: string;
  categoryWeight: number; // e.g. 65 (65%)
  description: string;
  targetDisplay: string;
  targetValue: number;
  unit: string;
  weight: number; // bobot parameter dalam total KPI, e.g. 20 (20%)
  aggregationType: "AVERAGE" | "SUM";
  criteria: CriterionRule[];
  monthlyActuals: { [monthIndex: number]: number | null }; // 1..12
  monthlyNotes: { [monthIndex: number]: string };
}

export interface EmployeeProfile {
  id: number;
  nik: string;
  name: string;
  department: string;
  jobPosition: string;
  jobLevel: string;
  appraiserName: string;
  operatingUnit: string;
  avatarUrl?: string;
}

export interface InputKpiClientProps {
  initialEmployees: EmployeeProfile[];
  initialYears: number[];
  initialSelectedEmployeeId?: number;
  initialMonth?: number;
  initialTab?: "collapsible" | "overview" | "bulanan" | "tahunan" | "review";
  initialGroups?: KpiParameterGroup[];
  appraisalId?: number;
}

export const DEFAULT_COLLAPSIBLE_GROUPS: KpiParameterGroup[] = [
  {
    id: "param-group-1",
    number: 1,
    name: "Target Kerja",
    weight: 65,
    kpis: [
      {
        id: "kpi-1-1",
        code: "1.1",
        name: "Rasio Deadstock",
        description: "Pengendalian rasio material deadstock di warehouse agar tidak melebihi batas maksimal 6%.",
        target: 6,
        targetDisplay: "6%",
        unit: "%",
        weightInParameter: 20,
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        criteria: [
          { label: "≤ 3%", operator: "LTE", maxValue: 3, score: 25 },
          { label: "> 3% - ≤ 6%", operator: "BETWEEN", minValue: 3, maxValue: 6, score: 15 },
          { label: "> 6%", operator: "GT", minValue: 6, score: 5 },
        ],
        monthlyActuals: {
          0: 3,
          1: 4,
          2: 5,
          3: 4,
          4: 4.5,
          5: 4.2,
          6: 4.1,
          7: 4.3,
          8: 4.4,
          9: 4.5,
          10: null,
          11: null,
        },
        monthlyNotes: {
          0: "Pengendalian material deadstock optimal di Q1",
        },
      },
      {
        id: "kpi-1-2",
        code: "1.2",
        name: "Nilai Stock On Hand",
        description: "Pengendalian nilai persediaan inventaris barang agar tetap berada dalam limit buffer 25.000.",
        target: 25000,
        targetDisplay: "25,000",
        unit: "Juta Rp",
        weightInParameter: 25,
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        criteria: [
          { label: "≤ 25,000", operator: "LTE", maxValue: 25000, score: 25 },
          { label: "25,001 - 27,500", operator: "BETWEEN", minValue: 25000, maxValue: 27500, score: 15 },
          { label: "> 27,500", operator: "GT", minValue: 27500, score: 5 },
        ],
        monthlyActuals: {
          0: 24500,
          1: 24963,
          2: 24800,
          3: 25000,
          4: 24900,
          5: 25100,
          6: 24950,
          7: 25050,
          8: 24900,
          9: 24963,
          10: null,
          11: null,
        },
        monthlyNotes: {
          1: "Nilai persediaan terkontrol di bawah limit anggaran 25 M",
        },
      },
      {
        id: "kpi-1-3",
        code: "1.3",
        name: "Daily Stock Taking",
        description: "Pelaksanaan stock opname dan pencatatan fisik harian di warehouse (Target tahunan: 317 hari).",
        target: 317,
        targetDisplay: "317",
        unit: "Hari",
        weightInParameter: 20,
        aggregation: "SUM",
        compareBasis: "ACHIEVEMENT",
        criteria: [
          { label: "≥ 100% Target (317 Hari)", operator: "GTE", minValue: 100, score: 25 },
          { label: "90% - 99% Target", operator: "BETWEEN", minValue: 90, maxValue: 99.99, score: 15 },
          { label: "< 90% Target", operator: "LT", maxValue: 90, score: 5 },
        ],
        monthlyActuals: {
          0: 26,
          1: 24,
          2: 31,
          3: 30,
          4: 31,
          5: 30,
          6: 31,
          7: 31,
          8: 30,
          9: 35,
          10: null,
          11: null,
        },
        monthlyNotes: {
          0: "Pencatatan harian shift pagi selesai tepat waktu",
        },
      },
    ],
  },
  {
    id: "param-group-2",
    number: 2,
    name: "Kehadiran & Disiplin",
    weight: 20,
    kpis: [
      {
        id: "kpi-2-1",
        code: "2.1",
        name: "Kehadiran",
        description: "Persentase kehadiran kerja tanpa mangkir dan ketepatan absensi kehadiran harian.",
        target: 98,
        targetDisplay: "≥ 98%",
        unit: "%",
        weightInParameter: 20,
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        criteria: [
          { label: "≥ 98%", operator: "GTE", minValue: 98, score: 25 },
          { label: "95% - 97.9%", operator: "BETWEEN", minValue: 95, maxValue: 97.99, score: 15 },
          { label: "< 95%", operator: "LT", maxValue: 95, score: 5 },
        ],
        monthlyActuals: {
          0: 98.5,
          1: 100,
          2: 98,
          3: 99,
          4: 100,
          5: 98,
          6: 99.5,
          7: 100,
          8: 98.5,
          9: 99,
          10: null,
          11: null,
        },
        monthlyNotes: {},
      },
    ],
  },
  {
    id: "param-group-3",
    number: 3,
    name: "Keselamatan Kerja",
    weight: 10,
    kpis: [
      {
        id: "kpi-3-1",
        code: "3.1",
        name: "Keselamatan Kerja",
        description: "Penerapan standar K3, kepatuhan pemakaian APD di warehouse, dan pencapaian Zero LTI.",
        target: 100,
        targetDisplay: "100% (Zero Accident)",
        unit: "%",
        weightInParameter: 10,
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        criteria: [
          { label: "= 100% (Zero LTI)", operator: "GTE", minValue: 100, score: 25 },
          { label: "90% - 99.9%", operator: "BETWEEN", minValue: 90, maxValue: 99.99, score: 15 },
          { label: "< 90% (Ada Insiden)", operator: "LT", maxValue: 90, score: 5 },
        ],
        monthlyActuals: {
          0: 100,
          1: 100,
          2: 100,
          3: 100,
          4: 100,
          5: 100,
          6: 100,
          7: 100,
          8: 100,
          9: 100,
          10: null,
          11: null,
        },
        monthlyNotes: {},
      },
    ],
  },
  {
    id: "param-group-4",
    number: 4,
    name: "Kepatuhan & SP",
    weight: 10,
    kpis: [
      {
        id: "kpi-4-1",
        code: "4.1",
        name: "Kepatuhan & SP",
        description: "Tingkat kepatuhan terhadap SOP warehouse dan bebas dari Surat Peringatan (SP).",
        target: 0,
        targetDisplay: "0 Kasus / Bersih",
        unit: "Kasus",
        weightInParameter: 10,
        aggregation: "SUM",
        compareBasis: "ACTUAL",
        criteria: [
          { label: "= 0 (Tanpa SP)", operator: "LTE", maxValue: 0, score: 25 },
          { label: "= 1 SP", operator: "EQ", minValue: 1, maxValue: 1, score: 10 },
          { label: "≥ 2 SP", operator: "GTE", minValue: 2, score: 0 },
        ],
        monthlyActuals: {
          0: 0,
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
          6: 0,
          7: 0,
          8: 0,
          9: 0,
          10: null,
          11: null,
        },
        monthlyNotes: {},
      },
    ],
  },
  {
    id: "param-group-5",
    number: 5,
    name: "Inovasi & Improvement",
    weight: 10,
    kpis: [
      {
        id: "kpi-5-1",
        code: "5.1",
        name: "Inovasi & Improvement",
        description: "Usulan inisiatif Kaizen perbaikan tata letak atau digitalisasi proses kerja gudang.",
        target: 1,
        targetDisplay: "≥ 1 Usulan",
        unit: "Usulan",
        weightInParameter: 10,
        aggregation: "SUM",
        compareBasis: "ACTUAL",
        criteria: [
          { label: "≥ 1 Ide Terverifikasi", operator: "GTE", minValue: 1, score: 25 },
          { label: "Dalam Pengajuan", operator: "BETWEEN", minValue: 0.5, maxValue: 0.99, score: 15 },
          { label: "0 Usulan", operator: "LTE", maxValue: 0, score: 5 },
        ],
        monthlyActuals: {
          0: 1,
          1: 1,
          2: 0,
          3: 1,
          4: 1,
          5: 0,
          6: 1,
          7: 1,
          8: 1,
          9: 0,
          10: null,
          11: null,
        },
        monthlyNotes: {},
      },
    ],
  },
];

// ============================================================================
// DEFAULT KPI PARAMETERS DATASET
// ============================================================================

const INITIAL_PARAMETERS: KpiParameterItem[] = [
  // 1. KATEGORI: Target Kerja (Bobot Kategori 65%)
  {
    id: "param-1",
    code: "#1",
    name: "Pemenuhan Kebutuhan User",
    category: "Target Kerja",
    categoryWeight: 65,
    description: "95% harus siap supply atau consignment yang tersedia untuk seluruh unit operasional.",
    targetDisplay: "95%",
    targetValue: 95,
    unit: "%",
    weight: 20,
    aggregationType: "AVERAGE",
    criteria: [
      { label: "> 95%", operator: "GT", threshold1: 95, score: 25 },
      { label: "= 95%", operator: "EQ", threshold1: 95, score: 15 },
      { label: "< 95%", operator: "LT", threshold1: 95, score: 5 },
    ],
    monthlyActuals: {
      1: 91.45,
      2: 93.2,
      3: 95.0,
      4: 94.8,
      5: 96.1,
      6: 95.5,
      7: 94.0,
      8: 95.2,
      9: 96.0,
      10: 95.8,
      11: null,
      12: null,
    },
    monthlyNotes: {
      1: "Terdapat keterlambatan pengiriman vendor spare part di minggu kedua.",
      2: "Vendor utama sudah kembali normal, supply warehouse membaik.",
      3: "Target tercapai optimal 95.0% tepat waktu.",
    },
  },
  {
    id: "param-2",
    code: "#2",
    name: "Rasio Deadstock",
    category: "Target Kerja",
    categoryWeight: 65,
    description: "Pengendalian rasio material deadstock di warehouse agar tidak melebihi batas maksimal 3%.",
    targetDisplay: "≤ 3%",
    targetValue: 3,
    unit: "%",
    weight: 25,
    aggregationType: "AVERAGE",
    criteria: [
      { label: "≤ 3%", operator: "LTE", threshold1: 3, score: 25 },
      { label: "> 3% s/d 5%", operator: "BETWEEN", threshold1: 3, threshold2: 5, score: 15 },
      { label: "> 5%", operator: "GT", threshold1: 5, score: 5 },
    ],
    monthlyActuals: {
      1: 2.5,
      2: 2.8,
      3: 2.4,
      4: 3.1,
      5: 2.6,
      6: 2.5,
      7: 2.9,
      8: 2.7,
      9: 2.4,
      10: 2.3,
      11: null,
      12: null,
    },
    monthlyNotes: {
      1: "Scrap & disposal part usang berjalan lancar sesuai jadwal.",
    },
  },
  {
    id: "param-3",
    code: "#3",
    name: "Nilai Stock On Hand",
    category: "Target Kerja",
    categoryWeight: 65,
    description: "Pengendalian nilai persediaan inventory agar selalu berada dalam batas buffer budget operasional.",
    targetDisplay: "≤ Rp 12.5 M",
    targetValue: 12.5,
    unit: "Miliar Rp",
    weight: 20,
    aggregationType: "AVERAGE",
    criteria: [
      { label: "≤ 12.5 M", operator: "LTE", threshold1: 12.5, score: 25 },
      { label: "12.6 - 13.5 M", operator: "BETWEEN", threshold1: 12.5, threshold2: 13.5, score: 15 },
      { label: "> 13.5 M", operator: "GT", threshold1: 13.5, score: 5 },
    ],
    monthlyActuals: {
      1: 12.1,
      2: 12.3,
      3: 12.4,
      4: 12.2,
      5: 12.0,
      6: 12.2,
      7: 12.4,
      8: 12.3,
      9: 12.1,
      10: 11.9,
      11: null,
      12: null,
    },
    monthlyNotes: {
      1: "Nilai persediaan terkendali stabil di bawah limit anggaran.",
    },
  },

  // 2. KATEGORI: Kehadiran & Disiplin (Bobot Kategori 10%)
  {
    id: "param-4",
    code: "#4",
    name: "Kehadiran & Disiplin",
    category: "Kehadiran & Disiplin",
    categoryWeight: 10,
    description: "Persentase kehadiran kerja tanpa mangkir dan ketepatan absensi kehadiran harian.",
    targetDisplay: "≥ 98%",
    targetValue: 98,
    unit: "%",
    weight: 10,
    aggregationType: "AVERAGE",
    criteria: [
      { label: "≥ 98%", operator: "GTE", threshold1: 98, score: 25 },
      { label: "95% - 97.9%", operator: "BETWEEN", threshold1: 95, threshold2: 97.99, score: 15 },
      { label: "< 95%", operator: "LT", threshold1: 95, score: 5 },
    ],
    monthlyActuals: {
      1: 98.5,
      2: 100,
      3: 98.0,
      4: 99.0,
      5: 100,
      6: 98.0,
      7: 99.5,
      8: 100,
      9: 98.5,
      10: 99.0,
      11: null,
      12: null,
    },
    monthlyNotes: {
      1: "Tingkat disiplin dan kehadiran shift sangat baik.",
    },
  },

  // 3. KATEGORI: Keselamatan Kerja (Bobot Kategori 10%)
  {
    id: "param-5",
    code: "#5",
    name: "Keselamatan Kerja",
    category: "Keselamatan Kerja",
    categoryWeight: 10,
    description: "Penerapan standar K3, kepatuhan pemakaian APD, dan pencapaian Zero Lost Time Injury (LTI).",
    targetDisplay: "100% (Zero Accident)",
    targetValue: 100,
    unit: "%",
    weight: 10,
    aggregationType: "AVERAGE",
    criteria: [
      { label: "= 100% (Zero LTI)", operator: "GTE", threshold1: 100, score: 25 },
      { label: "90% - 99.9%", operator: "BETWEEN", threshold1: 90, threshold2: 99.99, score: 15 },
      { label: "< 90% (Ada Insiden)", operator: "LT", threshold1: 90, score: 5 },
    ],
    monthlyActuals: {
      1: 100,
      2: 100,
      3: 100,
      4: 100,
      5: 100,
      6: 100,
      7: 100,
      8: 100,
      9: 100,
      10: 100,
      11: null,
      12: null,
    },
    monthlyNotes: {
      1: "Zero Accident tercapai, seluruh checklist safety dan APD dipatuhi.",
    },
  },

  // 4. KATEGORI: Kepatuhan dan SP (Bobot Kategori 5%)
  {
    id: "param-6",
    code: "#6",
    name: "Kepatuhan dan SP",
    category: "Kepatuhan dan SP",
    categoryWeight: 5,
    description: "Tingkat kepatuhan terhadap peraturan perusahaan dan tidak menerima Surat Peringatan (SP).",
    targetDisplay: "0 Kasus / Bersih",
    targetValue: 0,
    unit: "Kasus SP",
    weight: 5,
    aggregationType: "SUM",
    criteria: [
      { label: "= 0 (Tanpa SP)", operator: "LTE", threshold1: 0, score: 25 },
      { label: "= 1 SP (SP 1)", operator: "EQ", threshold1: 1, score: 10 },
      { label: "≥ 2 SP", operator: "GTE", threshold1: 2, score: 0 },
    ],
    monthlyActuals: {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
      8: 0,
      9: 0,
      10: 0,
      11: null,
      12: null,
    },
    monthlyNotes: {
      1: "Kepatuhan tata tertib 100% tanpa catatan pelanggaran.",
    },
  },

  // 5. KATEGORI: Coaching & Counseling (Bobot Kategori 5%)
  {
    id: "param-7",
    code: "#7",
    name: "Coaching & Counseling",
    category: "Coaching & Counseling",
    categoryWeight: 5,
    description: "Pelaksanaan sesi pembinaan 1-on-1 dengan atasan langsung atau bawahan secara berkala.",
    targetDisplay: "100% (1 Sesi/Bulan)",
    targetValue: 100,
    unit: "%",
    weight: 5,
    aggregationType: "AVERAGE",
    criteria: [
      { label: "≥ 100% Terlaksana", operator: "GTE", threshold1: 100, score: 25 },
      { label: "80% - 99%", operator: "BETWEEN", threshold1: 80, threshold2: 99.99, score: 15 },
      { label: "< 80%", operator: "LT", threshold1: 80, score: 5 },
    ],
    monthlyActuals: {
      1: 100,
      2: 100,
      3: 100,
      4: 100,
      5: 100,
      6: 100,
      7: 100,
      8: 100,
      9: 100,
      10: 100,
      11: null,
      12: null,
    },
    monthlyNotes: {
      1: "Sesi pembinaan berkala terkait pencapaian operasional Q1 terlaksana.",
    },
  },

  // 6. KATEGORI: Improvement / Innovation (Bobot Kategori 5%)
  {
    id: "param-8",
    code: "#8",
    name: "Improvement / Innovation",
    category: "Improvement / Innovation",
    categoryWeight: 5,
    description: "Usulan inisiatif perbaikan kerja (Kaizen), efisiensi biaya, atau digitalisasi proses kerja.",
    targetDisplay: "≥ 1 Ide / Proyek",
    targetValue: 1,
    unit: "Usulan",
    weight: 5,
    aggregationType: "SUM",
    criteria: [
      { label: "≥ 1 Ide Terverifikasi", operator: "GTE", threshold1: 1, score: 25 },
      { label: "Dalam Pengajuan", operator: "EQ", threshold1: 0.5, score: 15 },
      { label: "0 Usulan", operator: "LTE", threshold1: 0, score: 5 },
    ],
    monthlyActuals: {
      1: 1,
      2: 1,
      3: 0,
      4: 1,
      5: 1,
      6: 0,
      7: 1,
      8: 1,
      9: 1,
      10: 0,
      11: null,
      12: null,
    },
    monthlyNotes: {
      1: "Inisiatif digitalisasi checklist inventaris material warehouse.",
    },
  },
];

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// Helper untuk evaluasi skor otomatis berdasarkan kriteria
function evaluateScore(val: number | null, rules: CriterionRule[]): number {
  if (val === null || isNaN(val)) return 0;
  for (const rule of rules) {
    if (rule.operator === "GT" && val > rule.threshold1) return rule.score;
    if (rule.operator === "GTE" && val >= rule.threshold1) return rule.score;
    if (rule.operator === "LT" && val < rule.threshold1) return rule.score;
    if (rule.operator === "LTE" && val <= rule.threshold1) return rule.score;
    if (rule.operator === "EQ" && Math.abs(val - rule.threshold1) < 0.001) return rule.score;
    if (
      rule.operator === "BETWEEN" &&
      rule.threshold2 !== undefined &&
      val >= rule.threshold1 &&
      val <= rule.threshold2
    ) {
      return rule.score;
    }
  }
  return 0;
}

// Helper untuk mengecek apakah aturan aktif
function isRuleMatched(val: number | null, rule: CriterionRule): boolean {
  if (val === null || isNaN(val)) return false;
  if (rule.operator === "GT" && val > rule.threshold1) return true;
  if (rule.operator === "GTE" && val >= rule.threshold1) return true;
  if (rule.operator === "LT" && val < rule.threshold1) return true;
  if (rule.operator === "LTE" && val <= rule.threshold1) return true;
  if (rule.operator === "EQ" && Math.abs(val - rule.threshold1) < 0.001) return true;
  if (
    rule.operator === "BETWEEN" &&
    rule.threshold2 !== undefined &&
    val >= rule.threshold1 &&
    val <= rule.threshold2
  ) {
    return true;
  }
  return false;
}

// ============================================================================
// MAIN CLIENT COMPONENT
// ============================================================================

export function InputKpiClient({
  initialEmployees = [],
  initialYears = [2025, 2026],
  initialSelectedEmployeeId,
  initialMonth,
  initialTab,
  initialGroups,
  appraisalId,
}: InputKpiClientProps) {
  const router = useRouter();

  // 1. Employee Context & Switcher
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number>(() => {
    if (initialSelectedEmployeeId && initialEmployees.some((e) => e.id === initialSelectedEmployeeId)) {
      return initialSelectedEmployeeId;
    }
    return initialEmployees.length > 0 ? initialEmployees[0].id : 1;
  });

  const currentEmployee = useMemo(() => {
    return (
      initialEmployees.find((e) => e.id === selectedEmployeeId) ||
      initialEmployees[0] || {
        id: 1,
        nik: "10006",
        name: "Nikan",
        department: "Warehouse",
        jobPosition: "Staff Warehouse",
        jobLevel: "Staff",
        appraiserName: "Rudi Hartono (Superintendent Logistik)",
        operatingUnit: "HO",
      }
    );
  }, [initialEmployees, selectedEmployeeId]);

  // 2. Filter & Navigation State
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [periodType, setPeriodType] = useState<"Bulanan" | "Tahunan">("Bulanan");
  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    return initialMonth && initialMonth >= 1 && initialMonth <= 12 ? initialMonth : 1;
  });
  const [activeTab, setActiveTab] = useState<"collapsible" | "overview" | "bulanan" | "tahunan" | "review">(() => {
    return initialTab || "collapsible";
  });
  const [kpiStatus, setKpiStatus] = useState<KpiStatus>("In Progress");

  // 3. Parameters State (Live Realisasi, Nilai & Catatan)
  const [parameters, setParameters] = useState<KpiParameterItem[]>(INITIAL_PARAMETERS);

  // Review Comments State
  const [reviewerComment, setReviewerComment] = useState<string>(
    "Pencapaian KPI secara umum sangat baik. Pemenuhan kebutuhan user di bulan Januari sempat 91.45% namun pulih di bulan berikutnya. Disiplin dan K3 konsisten 100%."
  );
  const [headDeptComment, setHeadDeptComment] = useState<string>(
    "Disetujui untuk diteruskan ke proses evaluasi kenaikan berkala."
  );

  // Sinkronkan tab ketika periodType diubah dari filter bar
  const handlePeriodTypeChange = (type: "Bulanan" | "Tahunan") => {
    setPeriodType(type);
    if (type === "Bulanan") {
      setActiveTab("bulanan");
    } else {
      setActiveTab("tahunan");
    }
  };

  // Handler input realisasi bulan aktif
  const handleActualChange = (paramId: string, valStr: string) => {
    const numericVal = valStr.trim() === "" ? null : parseFloat(valStr);
    setParameters((prev) =>
      prev.map((p) => {
        if (p.id !== paramId) return p;
        return {
          ...p,
          monthlyActuals: {
            ...p.monthlyActuals,
            [selectedMonth]: numericVal,
          },
        };
      })
    );
  };

  // Handler catatan bulan aktif
  const handleNotesChange = (paramId: string, text: string) => {
    setParameters((prev) =>
      prev.map((p) => {
        if (p.id !== paramId) return p;
        return {
          ...p,
          monthlyNotes: {
            ...p.monthlyNotes,
            [selectedMonth]: text,
          },
        };
      })
    );
  };

  // ============================================================================
  // LIVE COMPUTED VALUES & FORMULAS
  // ============================================================================

  // Perhitungan Bulanan (Bulan yang sedang dipilih)
  const monthlyCalculations = useMemo(() => {
    let totalScoreBulan = 0;
    let filledParams = 0;

    const list = parameters.map((param) => {
      const actualVal = param.monthlyActuals[selectedMonth] ?? null;
      const rawScore = evaluateScore(actualVal, param.criteria);
      const weightedScore = (rawScore / 25) * param.weight;

      if (actualVal !== null) {
        filledParams += 1;
        totalScoreBulan += weightedScore;
      }

      return {
        paramId: param.id,
        actualVal,
        rawScore,
        weightedScore,
      };
    });

    return {
      list,
      totalScoreBulan: parseFloat(totalScoreBulan.toFixed(2)),
      filledParams,
      totalParams: parameters.length,
      completionRate: Math.round((filledParams / parameters.length) * 100),
    };
  }, [parameters, selectedMonth]);

  // Perhitungan Tahunan (Agregasi 12 Bulan)
  const annualCalculations = useMemo(() => {
    let totalAnnualFinalScore = 0;
    let monthlyAchievementsSum = 0;
    let monthsWithDataCount = 0;

    for (let m = 1; m <= 12; m++) {
      let mScore = 0;
      let hasData = false;
      parameters.forEach((p) => {
        const val = p.monthlyActuals[m];
        if (val !== null) {
          hasData = true;
          const s = evaluateScore(val, p.criteria);
          mScore += (s / 25) * p.weight;
        }
      });
      if (hasData) {
        monthlyAchievementsSum += mScore;
        monthsWithDataCount += 1;
      }
    }

    const averageMonthlyAchievement =
      monthsWithDataCount > 0
        ? parseFloat((monthlyAchievementsSum / monthsWithDataCount).toFixed(2))
        : 0;

    const tableRows = parameters.map((param, index) => {
      const validActuals = Object.entries(param.monthlyActuals)
        .map(([m, val]) => ({ month: Number(m), val }))
        .filter((item) => item.val !== null)
        .map((item) => item.val as number);

      let annualActual: number | null = null;
      if (validActuals.length > 0) {
        if (param.aggregationType === "SUM") {
          annualActual = validActuals.reduce((sum, v) => sum + v, 0);
        } else {
          annualActual = parseFloat(
            (validActuals.reduce((sum, v) => sum + v, 0) / validActuals.length).toFixed(2)
          );
        }
      }

      const finalRawScore = evaluateScore(annualActual, param.criteria);
      const finalWeightedScore = parseFloat(((finalRawScore / 25) * param.weight).toFixed(2));
      totalAnnualFinalScore += finalWeightedScore;

      return {
        no: index + 1,
        param,
        annualActual,
        finalRawScore,
        finalWeightedScore,
      };
    });

    const finalTotalScore = parseFloat(totalAnnualFinalScore.toFixed(2));

    let gradeLabel = "C (Cukup)";
    let gradeBadge = "bg-amber-50 text-amber-700 border-amber-200";
    if (finalTotalScore >= 90) {
      gradeLabel = "A (Sangat Baik)";
      gradeBadge = "bg-emerald-50 text-emerald-800 border-emerald-300";
    } else if (finalTotalScore >= 80) {
      gradeLabel = "B (Baik)";
      gradeBadge = "bg-blue-50 text-blue-800 border-blue-200";
    } else if (finalTotalScore < 70) {
      gradeLabel = "D (Kurang)";
      gradeBadge = "bg-rose-50 text-rose-800 border-rose-200";
    }

    return {
      tableRows,
      finalTotalScore,
      averageMonthlyAchievement,
      totalParametersCount: parameters.length,
      gradeLabel,
      gradeBadge,
    };
  }, [parameters]);

  // Grouping parameters per kategori
  const categoriesGrouped = useMemo(() => {
    const groups: { [cat: string]: KpiParameterItem[] } = {};
    parameters.forEach((p) => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });
    return groups;
  }, [parameters]);

  // ============================================================================
  // WORKFLOW ACTIONS (Simpan Draft, Submit, Approve, Reject)
  // ============================================================================

  const handleSaveDraft = () => {
    setKpiStatus("Draft");
    Swal.fire({
      icon: "success",
      title: "Draft Tersimpan",
      text: `Data target & realisasi KPI Bulan ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} berhasil disimpan.`,
      timer: 1600,
      showConfirmButton: false,
    });
  };

  const handleSubmitEvaluation = () => {
    Swal.fire({
      title: "Submit Penilaian KPI?",
      text: `Penilaian KPI ${periodType} (${
        periodType === "Bulanan" ? MONTH_NAMES[selectedMonth - 1] : ""
      } ${selectedYear}) akan dikirim ke atasan penilai untuk proses review.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#1e293b",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Submit",
      cancelButtonText: "Batal",
    }).then((res) => {
      if (res.isConfirmed) {
        setKpiStatus("Submitted");
        Swal.fire({
          icon: "success",
          title: "Berhasil Disubmit",
          text: "Penilaian KPI berhasil dikirimkan ke Penilai Langsung.",
          timer: 1800,
          showConfirmButton: false,
        });
      }
    });
  };

  const handleApprove = () => {
    Swal.fire({
      title: "Approve Penilaian KPI?",
      text: `Setujui seluruh target dan realisasi KPI ${currentEmployee.name} dengan Total Score ${annualCalculations.finalTotalScore}%.`,
      icon: "success",
      showCancelButton: true,
      confirmButtonColor: "#0284c7",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Ya, Setujui",
      cancelButtonText: "Batal",
    }).then((res) => {
      if (res.isConfirmed) {
        setKpiStatus("Approved");
        Swal.fire({
          icon: "success",
          title: "KPI Disetujui",
          text: "Status penilaian kini menjadi Approved.",
          timer: 1800,
          showConfirmButton: false,
        });
      }
    });
  };

  const handleReject = () => {
    Swal.fire({
      title: "Kembalikan untuk Revisi?",
      input: "textarea",
      inputLabel: "Catatan Revisi:",
      inputPlaceholder: "Tuliskan catatan perbaikan data realisasi atau bukti pendukung...",
      inputValidator: (val) => (!val ? "Harap tuliskan catatan revisi!" : null),
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Kembalikan",
      cancelButtonText: "Batal",
    }).then((res) => {
      if (res.isConfirmed && res.value) {
        setKpiStatus("Rejected");
        setReviewerComment((prev) => `${prev}\n[Catatan Revisi]: ${res.value}`);
        Swal.fire({
          icon: "info",
          title: "Dikembalikan untuk Revisi",
          text: "Status penilaian diubah menjadi Rejected.",
          timer: 1800,
          showConfirmButton: false,
        });
      }
    });
  };

  // Status Badge Helper (Clean & Subtle, matching Screenshot 1)
  const getStatusBadge = (status: KpiStatus) => {
    switch (status) {
      case "Draft":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
            Draft
          </span>
        );
      case "Submitted":
      case "Under Review":
      case "In Progress":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            Waiting Approval
          </span>
        );
      case "Approved":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Approved
          </span>
        );
      case "Rejected":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
            Rejected
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 text-slate-800">
      {/* ==================================================================== */}
      {/* 1. TOP HEADER (MATCHING SCREENSHOT 1)                                */}
      {/* Back button + Bold Title + Metadata Subtitle + Edit / Action buttons  */}
      {/* ==================================================================== */}

      {/* 1. TOP NAVIGATION BAR */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xs px-5 py-3 transition flex items-center justify-between gap-4">
        {/* Left: Back button + Title */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition shrink-0"
            title="Kembali ke Dashboard"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">KPI System</span>
              <span className="text-xs text-slate-300">/</span>
              <h1 className="text-sm font-extrabold tracking-tight text-slate-900 uppercase">
                Input Penilaian KPI
              </h1>
            </div>
            <p className="text-xs text-slate-500">
              Formulir penilaian kinerja tahunan dan bulanan karyawan
            </p>
          </div>
        </div>

        {/* Right: Clean Action Buttons (Tanpa biru berlebihan) */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleSaveDraft}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition cursor-pointer"
          >
            <span>💾</span>
            <span>Simpan Draft</span>
          </button>

          <button
            type="button"
            onClick={handleSubmitEvaluation}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition cursor-pointer"
          >
            <span>Submit Penilaian</span>
          </button>
        </div>
      </div>

      {/* 2. DEDICATED EMPLOYEE INFORMATION CARD (BERSIH, TANPA DROPDOWN SWITCHER) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs transition">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 font-black text-lg shadow-2xs">
            {currentEmployee.name
              .split(" ")
              .filter(Boolean)
              .map((n) => n[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {currentEmployee.name}
              </h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                NIK: {currentEmployee.nik}
              </span>
              {getStatusBadge(kpiStatus)}
            </div>
            <p className="text-xs font-medium text-slate-500 mt-1">
              {currentEmployee.jobPosition} • Unit Kerja: <span className="font-semibold text-slate-700">{currentEmployee.operatingUnit}</span>
            </p>
          </div>
        </div>

        {/* Clean Metadata Grid: Nama, Departemen, Job Level, Penilai Langsung, Total Skor */}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Nama Karyawan
            </span>
            <span className="text-sm font-bold text-slate-900 mt-0.5 block truncate">
              {currentEmployee.name}
            </span>
          </div>

          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Departemen
            </span>
            <span className="text-sm font-bold text-slate-900 mt-0.5 block truncate">
              {currentEmployee.department}
            </span>
          </div>

          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Job Level
            </span>
            <span className="text-sm font-bold text-slate-900 mt-0.5 block truncate">
              {currentEmployee.jobLevel}
            </span>
          </div>

          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Penilai Langsung
            </span>
            <span className="text-sm font-bold text-slate-900 mt-0.5 block truncate" title={currentEmployee.appraiserName}>
              {currentEmployee.appraiserName}
            </span>
          </div>

          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100 col-span-2 sm:col-span-4 lg:col-span-1 flex items-center justify-between lg:block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Skor ({selectedYear})
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-mono text-sm font-black text-slate-900">
                {annualCalculations.finalTotalScore}%
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                Grade {annualCalculations.gradeLabel ? annualCalculations.gradeLabel.split(" ")[0] : "A"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Slim Tab Switcher (Minimalis & Ramping) */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-2.5 pt-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("collapsible")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              activeTab === "collapsible"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            Form Input KPI
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              activeTab === "overview"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("tahunan");
              setPeriodType("Tahunan");
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              activeTab === "tahunan"
                ? "bg-slate-900 text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            Rekap Tahunan ({selectedYear})
          </button>
        </div>

        <div className="text-xs text-slate-500">
          Periode Evaluasi: <strong className="text-slate-800 font-bold">{selectedYear}</strong>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* TAB 0: COLLAPSIBLE / DROPDOWN PER PARAMETER (DEFAULT & UTAMA)        */}
      {/* ==================================================================== */}
      {activeTab === "collapsible" && (
        <div className="pt-2">
          <KpiCollapsibleInput
            appraisalId={appraisalId}
            employee={{
              id: currentEmployee.id,
              nik: currentEmployee.nik,
              name: currentEmployee.name,
              department: currentEmployee.department,
              jobPosition: currentEmployee.jobPosition,
              jobLevel: currentEmployee.jobLevel,
              appraiserName: currentEmployee.appraiserName,
              periodYear: selectedYear,
            }}
            initialParameters={initialGroups && initialGroups.length > 0 ? initialGroups : DEFAULT_COLLAPSIBLE_GROUPS}
            initialStatus={kpiStatus === "Approved" ? "Approved" : kpiStatus === "Submitted" ? "Submitted" : "Draft"}
            onSaveDraft={handleSaveDraft}
            onSubmitPenilaian={handleSubmitEvaluation}
          />
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 1: OVERVIEW                                                      */}
      {/* ==================================================================== */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Total Skor Tahunan
              </span>
              <span className="text-2xl font-bold text-slate-900 mt-1 block">
                {annualCalculations.finalTotalScore}%
              </span>
              <span className="text-xs text-slate-500 mt-1 block">
                Predikat: <b className="text-slate-800">{annualCalculations.gradeLabel}</b>
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Rata-Rata Bulanan
              </span>
              <span className="text-2xl font-bold text-slate-900 mt-1 block">
                {annualCalculations.averageMonthlyAchievement}%
              </span>
              <span className="text-xs text-slate-500 mt-1 block">
                Akumulasi realisasi bulanan
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Total Indikator KPI
              </span>
              <span className="text-2xl font-bold text-slate-900 mt-1 block">
                {parameters.length} Indikator
              </span>
              <span className="text-xs text-slate-500 mt-1 block">
                {Object.keys(categoriesGrouped).length} Parameter Kinerja
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Status Pengisian
              </span>
              <span className="text-2xl font-bold text-slate-900 mt-1 block">
                {monthlyCalculations.filledParams} / {monthlyCalculations.totalParams}
              </span>
              <span className="text-xs text-slate-500 mt-1 block">
                Bulan {MONTH_SHORT[selectedMonth - 1]}: {monthlyCalculations.completionRate}% terisi
              </span>
            </div>
          </div>

          {/* Workflow Status Steps (Clean Text, No Emojis) */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              Tahapan Alur Penilaian KPI
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
              {[
                { label: "Draft", active: kpiStatus === "Draft" },
                { label: "In Progress", active: kpiStatus === "In Progress" },
                { label: "Submitted", active: kpiStatus === "Submitted" },
                { label: "Under Review", active: kpiStatus === "Under Review" },
                { label: "Approved", active: kpiStatus === "Approved" },
                { label: "Completed", active: kpiStatus === "Approved" },
              ].map((step, idx) => (
                <div
                  key={step.label}
                  className={`p-3 rounded-lg border transition ${
                    step.active
                      ? "border-slate-800 bg-slate-900 text-white font-bold"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  <div className="text-[10px] text-slate-400 font-mono">Langkah 0{idx + 1}</div>
                  <div className="mt-0.5">{step.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: INPUT BULANAN (MATCHING SCREENSHOT 1 & 2 FORM STYLE)         */}
      {/* Questions list with clean input cards, options, and descriptions     */}
      {/* ==================================================================== */}
      {activeTab === "bulanan" && (
        <div className="space-y-6">
          {/* Section Heading like Screenshot 1 Questions Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Questions ({parameters.length}) — KPI Bulan {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Isi realisasi aktual untuk setiap parameter KPI di bawah ini. Nilai skor dihitung otomatis sesuai kriteria.
              </p>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Skor Sementara: <b className="text-slate-900">{monthlyCalculations.totalScoreBulan}%</b>
            </div>
          </div>

          {/* Grouped Parameter Cards */}
          <div className="space-y-6">
            {Object.entries(categoriesGrouped).map(([category, items]) => {
              const categoryWeight = items.reduce((sum, p) => sum + p.weight, 0);

              return (
                <div key={category} className="space-y-3">
                  {/* Category Title Header (like DEFAULT SECTION in Screenshot 2) */}
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {category.toUpperCase()} SECTION ({categoryWeight}% DARI TOTAL KPI)
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {items.length} Parameter
                    </span>
                  </div>

                  {/* Parameter Items (Cards like Screenshot 1 & 2) */}
                  <div className="space-y-4">
                    {items.map((param) => {
                      const currentVal = param.monthlyActuals[selectedMonth] ?? null;
                      const currentNote = param.monthlyNotes[selectedMonth] ?? "";
                      const rawScore = evaluateScore(currentVal, param.criteria);
                      const finalScoreVal = parseFloat(((rawScore / 25) * param.weight).toFixed(2));

                      return (
                        <div
                          key={param.id}
                          className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4 hover:border-slate-300 transition"
                        >
                          {/* Parameter Title Bar (like #1 Dinding bangunan tidak retak/rusak Required) */}
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-100 pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-slate-400">{param.code}</span>
                                <h3 className="text-sm font-bold text-slate-900">{param.name}</h3>
                                <span className="text-xs font-medium text-rose-600">Required</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">{param.description}</p>
                            </div>

                            {/* Tags */}
                            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200">
                                Target: {param.targetDisplay}
                              </span>
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200">
                                Bobot: {param.weight}%
                              </span>
                            </div>
                          </div>

                          {/* Form Input Row (Clean Enterprise Form layout) */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {/* Input Realisasi */}
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Realisasi Bulan Ini
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  step="any"
                                  value={currentVal !== null ? currentVal : ""}
                                  onChange={(e) => handleActualChange(param.id, e.target.value)}
                                  placeholder={`Nilai (${param.unit})...`}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:border-slate-800 focus:outline-none transition"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium pointer-events-none">
                                  {param.unit}
                                </span>
                              </div>
                            </div>

                            {/* Skor Otomatis */}
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Skor Kriteria (Otomatis)
                              </label>
                              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs flex items-center justify-between">
                                <span className="font-bold text-slate-900">
                                  {currentVal !== null ? rawScore : "-"}
                                </span>
                                <span className="text-[11px] text-slate-400">Skala 25</span>
                              </div>
                            </div>

                            {/* Skor Akhir */}
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Skor Akhir (Score × Bobot)
                              </label>
                              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs flex items-center justify-between">
                                <span className="font-bold text-slate-900">
                                  {currentVal !== null ? `${finalScoreVal}%` : "-"}
                                </span>
                                <span className="text-[11px] text-slate-400">Max {param.weight}%</span>
                              </div>
                            </div>
                          </div>

                          {/* Options / Kriteria Penilaian List (Clean bullets like Screenshot 1) */}
                          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3.5 space-y-2">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                              Kriteria Penilaian:
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                              {param.criteria.map((rule, rIdx) => {
                                const isMatched = isRuleMatched(currentVal, rule);
                                return (
                                  <div
                                    key={rIdx}
                                    className={`flex items-center justify-between p-2 rounded border transition ${
                                      isMatched
                                        ? "border-emerald-500 bg-emerald-50 text-emerald-900 font-bold"
                                        : "border-slate-200 bg-white text-slate-600"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={isMatched ? "text-emerald-600 font-bold" : "text-slate-400"}>
                                        •
                                      </span>
                                      <span>{rule.label}</span>
                                    </div>
                                    <span className="text-[11px] text-slate-500">Skor {rule.score}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Catatan / Keterangan Alasan (like Label pertanyaan alasan di Screenshot 2) */}
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Keterangan / Catatan Penjelasan:
                            </label>
                            <input
                              type="text"
                              value={currentNote}
                              onChange={(e) => handleNotesChange(param.id, e.target.value)}
                              placeholder="Berikan alasan / detail realisasi..."
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-800 focus:outline-none transition"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Save / Submit Bar */}
          <div className="flex items-center justify-between border-t border-slate-200 pt-5">
            <div className="text-xs text-slate-500">
              Total Skor Bulan {MONTH_NAMES[selectedMonth - 1]}: <b className="text-slate-900">{monthlyCalculations.totalScoreBulan}%</b>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveDraft}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Simpan Draft
              </button>
              <button
                type="button"
                onClick={handleSubmitEvaluation}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Submit Penilaian
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: REKAP TAHUNAN                                                 */}
      {/* Clean 12-month table, matching Screenshot 1 table & card style      */}
      {/* ==================================================================== */}
      {activeTab === "tahunan" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                KPI Tahunan {selectedYear} — Rekapitulasi 12 Bulan
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Nilai bulanan terisi secara otomatis dari input bulanan. Nilai tahunan dan skor akhir dihitung melalui sistem.
              </p>
            </div>
          </div>

          {/* Clean 12-Month Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-600">
                    <th className="px-3 py-3 w-10 text-center">No</th>
                    <th className="px-4 py-3 min-w-[200px]">Parameter KPI</th>
                    <th className="px-3 py-3 text-center">Target</th>
                    {MONTH_SHORT.map((m, idx) => (
                      <th
                        key={m}
                        className={`px-2 py-3 text-center font-mono ${
                          selectedMonth === idx + 1 ? "bg-slate-100 font-bold text-slate-900" : ""
                        }`}
                      >
                        {m}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center bg-slate-50 font-bold text-slate-800">
                      Annual Actual
                    </th>
                    <th className="px-3 py-3 text-right bg-slate-50 font-bold text-slate-900 pr-4">
                      Final Score
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {annualCalculations.tableRows.map((row) => {
                    const { no, param, annualActual, finalWeightedScore } = row;

                    return (
                      <tr key={param.id} className="hover:bg-slate-50/60 transition">
                        <td className="px-3 py-3 text-center text-slate-400 font-mono">
                          {no}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{param.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {param.category} · Bobot {param.weight}%
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center text-slate-700 whitespace-nowrap">
                          {param.targetDisplay}
                        </td>

                        {/* 12 Bulan Data */}
                        {MONTH_SHORT.map((_, mIdx) => {
                          const val = param.monthlyActuals[mIdx + 1];
                          return (
                            <td
                              key={mIdx}
                              onClick={() => {
                                setSelectedMonth(mIdx + 1);
                                setPeriodType("Bulanan");
                                setActiveTab("bulanan");
                              }}
                              className="px-2 py-3 text-center font-mono text-xs cursor-pointer hover:bg-slate-100 transition"
                              title={`Klik untuk edit ${MONTH_NAMES[mIdx]}`}
                            >
                              {val !== null ? (
                                <span className="text-slate-800">{val}</span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Annual Actual */}
                        <td className="px-3 py-3 text-center font-mono font-semibold text-slate-900 whitespace-nowrap bg-slate-50/40">
                          {annualActual !== null ? `${annualActual} ${param.unit}` : "-"}
                        </td>

                        {/* Final Score */}
                        <td className="px-3 py-3 text-right font-mono font-bold text-slate-900 pr-4 whitespace-nowrap bg-slate-50/40">
                          {annualActual !== null ? (
                            <span className="rounded bg-emerald-50 text-emerald-800 px-2 py-0.5 border border-emerald-200">
                              {finalWeightedScore}%
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-xs">
                    <td colSpan={15} className="px-4 py-3 text-right text-slate-700">
                      Total Capaian Skor KPI Tahunan {selectedYear}:
                    </td>
                    <td colSpan={2} className="px-4 py-3 text-right font-bold text-slate-900 pr-4 text-sm font-mono">
                      {annualCalculations.finalTotalScore}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: REVIEW & APPROVAL                                             */}
      {/* Clean review workflow with clean buttons                             */}
      {/* ==================================================================== */}
      {activeTab === "review" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Review & Approval KPI
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Evaluasi resmi kinerja oleh Penilai Langsung dan persetujuan Head Department.
                </p>
              </div>

              <div>{getStatusBadge(kpiStatus)}</div>
            </div>

            {/* Review Form Fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Evaluasi Penilai Langsung ({currentEmployee.appraiserName}):
                </label>
                <textarea
                  rows={3}
                  value={reviewerComment}
                  onChange={(e) => setReviewerComment(e.target.value)}
                  placeholder="Tuliskan catatan evaluasi pencapaian target dan realisasi..."
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-800 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Head Department / Management:
                </label>
                <textarea
                  rows={2}
                  value={headDeptComment}
                  onChange={(e) => setHeadDeptComment(e.target.value)}
                  placeholder="Catatan dari Head Department..."
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-800 focus:outline-none transition"
                />
              </div>
            </div>

            {/* Review Actions */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <div className="text-xs text-slate-500">
                Persetujuan ini akan mengunci data penilaian dan finalisasi skor KPI.
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReject}
                  className="rounded-lg border border-rose-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                >
                  Kembalikan untuk Revisi
                </button>

                <button
                  type="button"
                  onClick={handleApprove}
                  className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  Approve Penilaian
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
