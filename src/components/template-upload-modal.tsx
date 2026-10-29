"use client";

import React, { useState, useRef, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import {
  X,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Plus,
  Trash2,
  Calendar,
  BarChart2,
  RefreshCw,
  FileSpreadsheet,
  Layers,
  User,
  Users,
  Building2,
  Briefcase,
} from "lucide-react";
import * as XLSX from "xlsx";
import type {
  Department,
  JobLevel,
  JobPosition,
  Employee,
  KpiPeriod,
  KpiCategory,
  KpiParameter,
} from "@/db/schema";
import { createTemplateFromExcel, type ImportCategoryInput } from "@/lib/actions";
import { parseConditionString } from "@/lib/excel-template-kpi";
import {
  savePersonalTemplateFromExcelAction,
  batchSavePersonalTemplatesFromExcelAction,
  type SavePersonalTemplateFromExcelInput,
} from "@/lib/personal-template-actions";

export interface KpiBandDraft {
  id?: string;
  label: string;
  score: number;
  operator?: string;
  operatorSymbol?: string;
  criteriaValue?: string;
}

export interface KpiParameterDraft {
  id: string;
  code: string; // "1.1", "1.2", "2", etc.
  name: string; // "1.1 Pemenuhan Kebutuhan User"
  description?: string; // target / description
  internalWeight: number; // 20, 25, 30, 25 (sums to 100% inside Target Kerja); 100 for direct
  skor: number;
  bands: KpiBandDraft[];
}

export interface KpiCategoryDraft {
  id: string;
  categoryNumber: number; // 1 to 5
  name: string; // "Target Kerja", "Kehadiran & Disiplin", etc.
  weight: number; // 65, 20, 10, 10, 10 (sums to 115%)
  categoryType: "SUB_ITEMS" | "DIRECT";
  params: KpiParameterDraft[];
}

export interface ParsedSheetData {
  sheetName: string;
  sheetIndex: number;
  detectedNik: string;
  detectedName: string;
  matchedEmployee: Employee | null;
  departmentId: number | "";
  jobLevelId: number | "";
  periodYear: string;
  categories: KpiCategoryDraft[];
  totalParameterBobot: number;
  totalSubItemsBobot?: number;
}

/**
 * Menyusun struktur 5 parameter utama dan sub-parameter untuk database template KPI
 */
export function buildCategoriesPayloadFromDraft(categories: KpiCategoryDraft[]): ImportCategoryInput[] {
  return categories.map((cat, cIdx) => {
    const isSub = cat.categoryType === "SUB_ITEMS" || cat.categoryNumber === 1;

    return {
      name: cat.name.trim(),
      weight: (Number(cat.weight) || 0) / 100, // 0.65, 0.20, 0.10, 0.10, 0.10
      categoryType: isSub ? "SUB_ITEMS" : "DIRECT",
      sortOrder: cat.categoryNumber || cIdx + 1,
      params: cat.params.map((p, pIdx) => {
        const formattedBands = (p.bands || []).map((b, bIdx) => {
          const rawText =
            b.label ||
            (b.operatorSymbol && b.operatorSymbol !== "Teks"
              ? `${b.operatorSymbol} ${b.criteriaValue || ""}`
              : b.criteriaValue) ||
            "";
          const cond = parseConditionString(rawText);
          const effectiveOp =
            b.operator ||
            (b.operatorSymbol === ">="
              ? "GTE"
              : b.operatorSymbol === ">"
              ? "GT"
              : b.operatorSymbol === "<="
              ? "LTE"
              : b.operatorSymbol === "<"
              ? "LT"
              : b.operatorSymbol === "="
              ? "EQ"
              : b.operatorSymbol === "Rentang"
              ? "BETWEEN"
              : cond.operator || "GTE");

          return {
            label: rawText || `Kriteria ${bIdx + 1}`,
            operator: effectiveOp as any,
            minValue: cond.minValue,
            maxValue: cond.maxValue,
            score: Number(b.score) || 0,
            sortOrder: bIdx + 1,
          };
        });

        // Untuk SUB_ITEMS (Target Kerja), weight adalah bobot internal (20%, 25%, 30%, 25%) -> 0.20, 0.25, 0.30, 0.25
        // Untuk DIRECT (Indikator 2-5), weight adalah 1.0 (100% dari kategori tersebut)
        let paramWeight = isSub ? (Number(p.internalWeight) || 0) / 100 : 1.0;
        if (paramWeight <= 0) {
          paramWeight = isSub ? 0.25 : 1.0;
        }

        return {
          name: p.name.trim(),
          description: p.description?.trim() || undefined,
          target: "100",
          unit: "%",
          weight: paramWeight,
          maxScore: Number(p.skor) || 25,
          inputType: "MONTHLY_ACTUAL" as const,
          sortOrder: pIdx + 1,
          bands:
            formattedBands.length > 0
              ? formattedBands
              : [
                  { label: "Sangat Baik", operator: "GTE" as const, score: Number(p.skor) || 25, sortOrder: 1 },
                  { label: "Baik", operator: "GTE" as const, score: 15, sortOrder: 2 },
                  { label: "Cukup", operator: "LT" as const, score: 5, sortOrder: 3 },
                ],
        };
      }),
    };
  });
}

export interface TemplateUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  jobLevels: JobLevel[];
  jobPositions?: JobPosition[];
  employees?: Employee[];
  periods?: KpiPeriod[];
  activePeriod?: KpiPeriod;
  categories?: KpiCategory[];
  parameters?: KpiParameter[];
  onSuccess?: (templateId: number) => void;
}

export function TemplateUploadModal({
  isOpen,
  onClose,
  departments,
  jobLevels,
  jobPositions = [],
  employees = [],
  periods = [],
  activePeriod,
  parameters = [],
  onSuccess,
}: TemplateUploadModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  // Mode: Template Personal (per employee) vs Master Template Standar
  const [isPersonalMode, setIsPersonalMode] = useState<boolean>(true);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | "">("");

  // Section 1: Informasi Template & Departemen
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [jobLevelId, setJobLevelId] = useState<number | "">("");
  const [periodYear, setPeriodYear] = useState<string>("2026");

  // Section 2: Upload File & Multi-Sheet State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedSheets, setParsedSheets] = useState<ParsedSheetData[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);

  // Section 3: Data Parameter & Kategori KPI yang sedang aktif diedit
  const [categories, setCategories] = useState<KpiCategoryDraft[]>([]);

  // Kamus Parameter yang Sudah Ada (untuk pencocokan nama parameter)
  const existingParamMap = useMemo(() => {
    const map = new Map<string, KpiParameter>();
    for (const p of parameters) {
      if (p.name) map.set(p.name.toLowerCase().trim(), p);
    }
    return map;
  }, [parameters]);

  // Default period year
  useEffect(() => {
    if (activePeriod?.year) {
      setPeriodYear(String(activePeriod.year));
    } else if (periods.length > 0 && periods[0].year) {
      setPeriodYear(String(periods[0].year));
    }
  }, [activePeriod, periods]);

  // Reset modal state saat dibuka
  useEffect(() => {
    if (isOpen) {
      setUploadedFile(null);
      setParsedSheets([]);
      setActiveSheetIndex(0);
      setIsPersonalMode(true);
      setSelectedEmployeeId("");
      setDepartmentId("");
      setJobLevelId("");
      setCategories([]);
      if (activePeriod?.year) {
        setPeriodYear(String(activePeriod.year));
      } else {
        setPeriodYear("2026");
      }
    }
  }, [isOpen, activePeriod]);

  // Keyboard navigation: Close with ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isPending]);

  // Karyawan terpilih saat ini
  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employees.find((e) => e.id === Number(selectedEmployeeId)) || null;
  }, [employees, selectedEmployeeId]);

  // Helper unduh format Excel template KPI
  const handleDownloadTemplateExcel = () => {
    const wsData = [
      ["INFORMASI KARYAWAN & TEMPLATE KPI"],
      ["Nama Karyawan", "IWAN NYOLO"],
      ["NIK", "20.524.219"],
      ["Departemen", "Logistik"],
      ["Jabatan", "SUPT. LOGISTIK"],
      ["Periode", "2026"],
      [],
      ["Parameter", "Kriteria Penilaian", "Realisasi", "Skor", "Bobot", "Skor Akhir"],
      ["1. Target Kerja (65% dari 115%)", "", "", "", "", ""],
      ["1.1 Pemenuhan Kebutuhan User", "", "", "", "", ""],
      ["95% harus siap supply atau consi", ">95", "", 25, "", ""],
      ["", "95", "", 15, "20%", "0%"],
      ["", "<95", "", 5, "", ""],
      ["1.2 Rasio Deadstock", "", "", "", "", ""],
      ["", "<= 3%", "", 25, "", ""],
      ["", ">3 % s/d 6%", "", 15, "25%", "0%"],
      ["", ">6%", "", 5, "", ""],
      ["1.3 Nilai Stock On Hand", "", "", "", "", ""],
      ["", "<25 M", "", 25, "", ""],
      ["", "25", "", 15, "30%", "0%"],
      ["", ">25 M", "", 5, "", ""],
      ["", "", "", "", "", ""],
      ["1.4 Couching & Counseling", "", "", "", "", ""],
      ["", "> 100 %", "", 25, "", ""],
      ["", ">90 % <95 %", "", 15, "25%", "0%"],
      ["", "<90%", "", 5, "", ""],
      ["", "", "", "", "", ""],
      ["2. Kehadiran & Disiplin", "", "", "", "", ""],
      ["", ">= 98 %", "", 25, "", ""],
      ["", "95% - 97 %", "", 15, "20%", "0%"],
      ["", "<95%", "", 5, "", ""],
      ["", "", "", "", "", ""],
      ["3. Keselamatan Kerja", "", "", "", "", ""],
      ["", "Tidak terlibat", "", 20, "", ""],
      ["", "nearmiss/", "", 15, "10%", "0%"],
      ["", "Accident", "", 0, "", ""],
      ["", "", "", "", "", ""],
      ["4. Kepatuhan dan SP", "", "", "", "", ""],
      ["", "Tidak ada SP", "", 15, "", ""],
      ["", "SP 1 Aktif", "", 10, "10%", "0%"],
      ["", "SP 2 Aktif", "", 5, "", ""],
      ["", "SP 3 Aktif", "", 0, "", ""],
      ["", "", "", "", "", ""],
      ["5. Inovasi dan Improvement", "", "", "", "", ""],
      ["", "≥ 2 Improvement", "", 15, "", ""],
      ["", "1 Improvement", "", 10, "10%", "0%"],
      ["", "Tidak ada", "", 5, "", ""],
      ["Total", "", "", "", "", "0%"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 38 }, // Parameter
      { wch: 32 }, // Kriteria Penilaian
      { wch: 12 }, // Realisasi
      { wch: 10 }, // Skor
      { wch: 12 }, // Bobot
      { wch: 12 }, // Skor Akhir
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Iwan nyolo-nyolo");
    XLSX.writeFile(wb, "Template_KPI_5_Parameter.xlsx");
  };

  // Helper ekstraksi metadata karyawan dari sel lembar kerja atau nama sheet
  const extractSheetEmployeeMetadata = (
    ws: XLSX.WorkSheet,
    sheetName: string
  ): {
    detectedNik: string;
    detectedName: string;
    matchedEmployee: Employee | null;
    departmentId: number | "";
    jobLevelId: number | "";
    periodYear: string;
  } => {
    const rows: (string | number | null | undefined)[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
    });

    let detectedNik = "";
    let detectedName = "";
    let detectedDept = "";
    let detectedYear = "";

    const cleanVal = (val: unknown): string => {
      if (val === null || val === undefined) return "";
      return String(val)
        .replace(/^[\s:=-]+/, "")
        .replace(/[\s:=-]+$/, "")
        .trim();
    };

    const isNameLabel = (s: string) =>
      /^(nama|nama\s*karyawan|nama\s*pegawai|employee\s*name|nama\s*lengkap|name)$/i.test(s);
    const isNikLabel = (s: string) =>
      /^(nik|n\.?i\.?k|no\.?\s*karyawan|nomor\s*induk|employee\s*id|nrp|nip)$/i.test(s);
    const isDeptLabel = (s: string) =>
      /^(departemen|department|dept|divisi|unit\s*kerja|bagian|unit)$/i.test(s);
    const isPeriodLabel = (s: string) =>
      /^(periode|period|tahun|year|tahun\s*penilaian|tahun\s*kpi)$/i.test(s);

    const topRows = rows.slice(0, 25);

    // 1. Scan sel pada 25 baris pertama
    for (let r = 0; r < topRows.length; r++) {
      const row = topRows[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cellStr = cleanVal(row[c]);
        if (!cellStr) continue;

        // Deteksi pola inline colon: "Nama : Iwan Nyolo" atau "NIK: 20.524.219"
        const colonMatch = cellStr.match(/^([^:\n\r]+)[:=-]\s*(.+)$/);
        if (colonMatch) {
          const lbl = colonMatch[1].trim().toLowerCase();
          const val = cleanVal(colonMatch[2]);
          if (isNameLabel(lbl) && !detectedName) detectedName = val;
          if (isNikLabel(lbl) && !detectedNik) detectedNik = val;
          if (isDeptLabel(lbl) && !detectedDept) detectedDept = val;
          if (isPeriodLabel(lbl) && !detectedYear) {
            const yM = val.match(/\b(20\d{2})\b/);
            if (yM) detectedYear = yM[1];
          }
          continue;
        }

        // Deteksi label terpisah pada sel ini
        const lower = cellStr.toLowerCase();
        if (isNikLabel(lower) && !detectedNik) {
          for (let nextC = c + 1; nextC <= Math.min(row.length - 1, c + 3); nextC++) {
            const cand = cleanVal(row[nextC]);
            if (cand && cand !== ":" && cand !== "-" && cand !== "=") {
              detectedNik = cand;
              break;
            }
          }
          if (!detectedNik && r + 1 < topRows.length) {
            const below = cleanVal(topRows[r + 1]?.[c]);
            if (below && below !== ":" && below !== "-" && below !== "=") {
              detectedNik = below;
            }
          }
        }

        if (isNameLabel(lower) && !detectedName) {
          for (let nextC = c + 1; nextC <= Math.min(row.length - 1, c + 3); nextC++) {
            const cand = cleanVal(row[nextC]);
            if (
              cand &&
              cand !== ":" &&
              cand !== "-" &&
              cand !== "=" &&
              !cand.toLowerCase().includes("nik") &&
              !cand.toLowerCase().includes("jabatan")
            ) {
              detectedName = cand;
              break;
            }
          }
          if (!detectedName && r + 1 < topRows.length) {
            const below = cleanVal(topRows[r + 1]?.[c]);
            if (below && below !== ":" && below !== "-" && below !== "=") {
              detectedName = below;
            }
          }
        }

        if (isDeptLabel(lower) && !detectedDept) {
          for (let nextC = c + 1; nextC <= Math.min(row.length - 1, c + 3); nextC++) {
            const cand = cleanVal(row[nextC]);
            if (cand && cand !== ":" && cand !== "-") {
              detectedDept = cand;
              break;
            }
          }
        }

        if (isPeriodLabel(lower) && !detectedYear) {
          for (let nextC = c + 1; nextC <= Math.min(row.length - 1, c + 3); nextC++) {
            const cand = cleanVal(row[nextC]);
            const yM = cand.match(/\b(20\d{2})\b/);
            if (yM) {
              detectedYear = yM[1];
              break;
            }
          }
        }

        // Direct NIK regex pattern: contoh "20.524.219"
        if (!detectedNik) {
          const nikRegex = cellStr.match(/\b\d{1,2}\.\d{3,4}\.\d{3,4}\b/);
          if (nikRegex) {
            detectedNik = nikRegex[0];
          }
        }
      }
    }

    // 2. Deteksi dari Nama Sheet (contoh "20.524.219 - Iwan Nyolo" atau "Iwan Nyolo")
    const cleanSheet = sheetName.trim();
    if (!detectedNik) {
      const sNikMatch = cleanSheet.match(/\b\d{1,2}\.\d{3,4}\.\d{3,4}\b/);
      if (sNikMatch) detectedNik = sNikMatch[0];
    }

    // 3. Pencocokan dengan database karyawan
    let matchedEmployee: Employee | null = null;
    if (detectedNik) {
      const cleanDetNik = detectedNik.replace(/[^0-9]/g, "");
      matchedEmployee =
        employees.find((e) => {
          const eClean = (e.nik || "").replace(/[^0-9]/g, "");
          return (
            eClean === cleanDetNik ||
            (e.nik && e.nik.toLowerCase() === detectedNik.toLowerCase())
          );
        }) || null;
    }

    if (!matchedEmployee && detectedName) {
      const cleanDetName = detectedName.toLowerCase().trim();
      matchedEmployee =
        employees.find((e) => {
          const eName = (e.name || "").toLowerCase().trim();
          return (
            eName === cleanDetName ||
            eName.includes(cleanDetName) ||
            cleanDetName.includes(eName)
          );
        }) || null;
    }

    if (!matchedEmployee && cleanSheet) {
      const sNameLower = cleanSheet.toLowerCase();
      matchedEmployee =
        employees.find((e) => {
          const eName = (e.name || "").toLowerCase().trim();
          const eNik = (e.nik || "").toLowerCase().trim();
          return (
            (eNik && sNameLower.includes(eNik)) ||
            (eName.length >= 4 && sNameLower.includes(eName))
          );
        }) || null;
    }

    let resolvedDeptId: number | "" = "";
    let resolvedJobLevelId: number | "" = "";

    if (matchedEmployee) {
      resolvedDeptId = matchedEmployee.departmentId;
      resolvedJobLevelId = matchedEmployee.jobLevelId;
      if (!detectedName) detectedName = matchedEmployee.name;
      if (!detectedNik) detectedNik = matchedEmployee.nik;
    } else if (detectedDept) {
      const foundDept = departments.find(
        (d) =>
          d.name.toLowerCase() === detectedDept.toLowerCase() ||
          (d.code && d.code.toLowerCase() === detectedDept.toLowerCase()) ||
          d.name.toLowerCase().includes(detectedDept.toLowerCase())
      );
      if (foundDept) resolvedDeptId = foundDept.id;
    }

    return {
      detectedNik,
      detectedName,
      matchedEmployee,
      departmentId: resolvedDeptId,
      jobLevelId: resolvedJobLevelId,
      periodYear: detectedYear || periodYear,
    };
  };

  // Helper parsing struktur Parameter & Sub-parameter dari sebuah sheet Excel
  const parseSheetCategories = (
    ws: XLSX.WorkSheet
  ): { categories: KpiCategoryDraft[]; totalParameterBobot: number } => {
    const rows: (string | number)[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
    });

    let headerRowIdx = -1;
    let colParam = -1;
    let colKriteria = -1;
    let colSkor = -1;
    let colBobot = -1;

    for (let r = 0; r < Math.min(rows.length, 25); r++) {
      const row = rows[r] || [];
      const lower = row.map((cell) => String(cell || "").toLowerCase().trim());

      const hasParamOrKpi = lower.some(
        (c) =>
          c === "parameter" ||
          c.includes("parameter") ||
          c.includes("indikator") ||
          c.includes("kpi") ||
          c.includes("nama")
      );
      const hasWeightOrScoreOrCriteria = lower.some(
        (c) =>
          c.includes("kriteria") ||
          c.includes("skor") ||
          c.includes("bobot") ||
          c.includes("weight")
      );

      if (hasParamOrKpi && hasWeightOrScoreOrCriteria) {
        headerRowIdx = r;
        lower.forEach((c, idx) => {
          if (
            (c === "skor" || c.includes("skor") || c.includes("score")) &&
            !c.includes("akhir") &&
            !c.includes("total")
          ) {
            if (colSkor === -1) colSkor = idx;
          } else if (c.includes("bobot") || c.includes("weight") || c === "%" || c.includes("bobot (%)")) {
            if (colBobot === -1) colBobot = idx;
          } else if (c.includes("kriteria") || c.includes("deskripsi") || c.includes("criteria") || c.includes("standar")) {
            if (colKriteria === -1) colKriteria = idx;
          } else if (c.includes("parameter") || c.includes("indikator") || c.includes("kpi") || c.includes("nama")) {
            if (colParam === -1) colParam = idx;
          }
        });
        break;
      }
    }

    if (colParam === -1 && headerRowIdx !== -1) colParam = 0;
    if (colKriteria === -1 && headerRowIdx !== -1 && rows[headerRowIdx]?.length > 1) colKriteria = 1;

    const categoriesList: KpiCategoryDraft[] = [];
    let currentCat: KpiCategoryDraft | null = null;
    let currentParam: KpiParameterDraft | null = null;

    const flushParam = () => {
      if (currentParam && currentCat) {
        if (!currentParam.bands || currentParam.bands.length === 0) {
          const defaultCond = parseConditionString("Target Tercapai");
          currentParam.bands = [
            {
              id: `band-${Date.now()}-1`,
              label: "Target Tercapai",
              operator: defaultCond.operator,
              operatorSymbol: defaultCond.operatorSymbol,
              criteriaValue: "100%",
              score: currentParam.skor || 25,
            },
          ];
        }
        currentParam.skor = Math.max(...currentParam.bands.map((b) => b.score));
        currentCat.params.push(currentParam);
        currentParam = null;
      }
    };

    const flushCat = () => {
      flushParam();
      if (currentCat) {
        categoriesList.push(currentCat);
        currentCat = null;
      }
    };

    if (headerRowIdx !== -1) {
      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const rawParam = colParam !== -1 ? String(row[colParam] || "").trim() : "";
        const rawKriteria = colKriteria !== -1 ? String(row[colKriteria] || "").trim() : "";
        const rawSkor =
          colSkor !== -1 && row[colSkor] !== undefined && row[colSkor] !== ""
            ? String(row[colSkor]).trim()
            : "";
        const rawBobot =
          colBobot !== -1 && row[colBobot] !== undefined && row[colBobot] !== ""
            ? String(row[colBobot]).trim()
            : "";

        if (!rawParam && !rawKriteria && !rawSkor && !rawBobot) continue;
        if (rawParam.toLowerCase().startsWith("total") || rawKriteria.toLowerCase().startsWith("total")) break;

        const isSub = /^[0-9]+\.[0-9]+/.test(rawParam);
        const catMatch = !isSub && rawParam.match(/^([1-5])[.)]\s*([^(\n]+)(?:\(([0-9.]+)\s*%.*\))?/i);

        // 1. Parameter Utama (Indikator 1 sampai 5)
        if (catMatch) {
          flushCat();
          const catNum = parseInt(catMatch[1], 10);
          const catName = catMatch[2].trim();
          let weight = catNum === 1 ? 65 : catNum === 2 ? 20 : 10;
          if (catMatch[3]) {
            const parsedW = parseFloat(catMatch[3]);
            if (!isNaN(parsedW) && parsedW > 0) weight = parsedW;
          }

          currentCat = {
            id: `cat-${catNum}-${Date.now()}`,
            categoryNumber: catNum,
            name: catName,
            weight: weight,
            categoryType: catNum === 1 ? "SUB_ITEMS" : "DIRECT",
            params: [],
          };

          // Parameter 2 sampai 5 langsung memiliki 1 item penilaian direct
          if (catNum >= 2) {
            currentParam = {
              id: `param-${catNum}-${Date.now()}`,
              code: String(catNum),
              name: `${catNum}. ${catName}`,
              description: "",
              internalWeight: 100,
              skor: catNum === 3 ? 20 : catNum >= 4 ? 15 : 25,
              bands: [],
            };
          }
          continue;
        }

        // 2. Sub-Parameter pada Parameter 1 Target Kerja (1.1, 1.2, 1.3, 1.4)
        if (isSub) {
          flushParam();
          const codeMatch = rawParam.match(/^([0-9]+\.[0-9]+)/);
          const code = codeMatch ? codeMatch[1] : "";
          if (!currentCat) {
            currentCat = {
              id: `cat-1-${Date.now()}`,
              categoryNumber: 1,
              name: "Target Kerja",
              weight: 65,
              categoryType: "SUB_ITEMS",
              params: [],
            };
          }
          currentParam = {
            id: `param-${code}-${Date.now()}-${r}`,
            code: code,
            name: rawParam,
            description: "",
            internalWeight: 0,
            skor: 25,
            bands: [],
          };
          continue;
        }

        // 3. Deskripsi / Target Sub-Parameter (bila ada teks pada kolom parameter yang bukan kode)
        if (rawParam && currentParam && !rawParam.match(/^[0-9]+[.)]/)) {
          currentParam.description = rawParam;
        }

        // 4. Kriteria Penilaian & Skor (Bands)
        if (rawKriteria && currentParam) {
          let scoreNum = 25;
          if (rawSkor) {
            const s = parseFloat(rawSkor.replace(",", "."));
            if (!isNaN(s)) scoreNum = s;
          }
          const cond = parseConditionString(rawKriteria);
          currentParam.bands = currentParam.bands || [];
          currentParam.bands.push({
            id: `band-${r}-${currentParam.bands.length}`,
            label: rawKriteria,
            operator: cond.operator,
            operatorSymbol: cond.operatorSymbol,
            criteriaValue: cond.criteriaValue || rawKriteria,
            score: scoreNum,
          });
        }

        // 5. Bobot Internal (pada sub-parameter Target Kerja)
        if (rawBobot && currentParam && currentCat?.categoryNumber === 1) {
          const b = parseFloat(rawBobot.replace("%", "").replace(",", ".").trim());
          if (!isNaN(b) && b > 0) {
            currentParam.internalWeight = b <= 1 ? Math.round(b * 100) : Math.round(b);
          }
        }
      }

      flushCat();
    }

    // Fallback: Jika tidak terdeteksi hierarki 5 parameter (file Excel flat)
    if (categoriesList.length === 0 && headerRowIdx !== -1) {
      const fallbackParams: KpiParameterDraft[] = [];
      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const rawParam = colParam !== -1 ? String(row[colParam] || "").trim() : "";
        const rawKriteria = colKriteria !== -1 ? String(row[colKriteria] || "").trim() : "";
        if (!rawParam && !rawKriteria) continue;
        if (rawParam.toLowerCase().startsWith("total")) continue;

        let rawSkor = 25;
        if (colSkor !== -1 && row[colSkor] !== undefined && row[colSkor] !== "") {
          const sNum = parseFloat(String(row[colSkor]).replace(",", "."));
          if (!isNaN(sNum) && sNum > 0) rawSkor = sNum;
        }

        let rawBobot = 20;
        if (colBobot !== -1 && row[colBobot] !== undefined && row[colBobot] !== "") {
          const bStr = String(row[colBobot]).replace("%", "").replace(",", ".").trim();
          const bNum = parseFloat(bStr);
          if (!isNaN(bNum) && bNum > 0) rawBobot = bNum <= 1 ? Math.round(bNum * 100) : Math.round(bNum);
        }

        const cond = parseConditionString(rawKriteria || "Target Tercapai");
        fallbackParams.push({
          id: `param-${r}`,
          code: `1.${fallbackParams.length + 1}`,
          name: rawParam || `Indikator ${r}`,
          description: "",
          internalWeight: rawBobot,
          skor: rawSkor,
          bands: [
            {
              id: `band-${r}-1`,
              label: rawKriteria || "Target Tercapai",
              operator: cond.operator,
              operatorSymbol: cond.operatorSymbol,
              criteriaValue: cond.criteriaValue || rawKriteria || "Target Tercapai",
              score: rawSkor,
            },
          ],
        });
      }

      if (fallbackParams.length > 0) {
        categoriesList.push({
          id: `cat-1-${Date.now()}`,
          categoryNumber: 1,
          name: "Key Performance Indicators",
          weight: 100,
          categoryType: "SUB_ITEMS",
          params: fallbackParams,
        });
      }
    }

    const totalBobot = Math.round(
      categoriesList.reduce((sum, c) => sum + (Number(c.weight) || 0), 0)
    );

    return { categories: categoriesList, totalParameterBobot: totalBobot };
  };

  // Helper parsing keseluruhan workbook Excel (multi-sheet)
  const parseExcelFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });

      const sheetNames = wb.SheetNames || [];
      if (sheetNames.length === 0) {
        throw new Error("File Excel tidak memiliki sheet yang dapat dibaca.");
      }

      // Filter sheet yang valid (bukan sheet mapping atau panduan)
      const validSheetNames = sheetNames.filter(
        (s) => !/^_system_mapping|panduan & ketentuan|panduan|info/i.test(s)
      );
      const targetSheetsToProcess = validSheetNames.length > 0 ? validSheetNames : [sheetNames[0]];

      const allParsedSheets: ParsedSheetData[] = [];

      for (let sIdx = 0; sIdx < targetSheetsToProcess.length; sIdx++) {
        const sName = targetSheetsToProcess[sIdx];
        const ws = wb.Sheets[sName];
        if (!ws) continue;

        // 1. Ekstrak data karyawan dari sheet
        const sheetEmp = extractSheetEmployeeMetadata(ws, sName);

        // 2. Ekstrak parameter & kategori KPI dari sheet
        const { categories: sheetCategories, totalParameterBobot: sBobot } =
          parseSheetCategories(ws);

        if (sheetCategories.length > 0 || targetSheetsToProcess.length === 1) {
          allParsedSheets.push({
            sheetName: sName,
            sheetIndex: sIdx,
            detectedNik: sheetEmp.detectedNik,
            detectedName: sheetEmp.detectedName,
            matchedEmployee: sheetEmp.matchedEmployee,
            departmentId: sheetEmp.departmentId,
            jobLevelId: sheetEmp.jobLevelId,
            periodYear: sheetEmp.periodYear,
            categories:
              sheetCategories.length > 0
                ? sheetCategories
                : [
                    {
                      id: `cat-1-${Date.now()}`,
                      categoryNumber: 1,
                      name: "Target Kerja",
                      weight: 65,
                      categoryType: "SUB_ITEMS",
                      params: [
                        {
                          id: `param-1.1-${Date.now()}`,
                          code: "1.1",
                          name: "1.1 Pemenuhan Kebutuhan User",
                          description: "",
                          internalWeight: 100,
                          skor: 25,
                          bands: [
                            {
                              id: `band-1`,
                              label: "> 95%",
                              operator: "GT",
                              operatorSymbol: ">",
                              criteriaValue: "95%",
                              score: 25,
                            },
                          ],
                        },
                      ],
                    },
                  ],
            totalParameterBobot: sBobot || 65,
          });
        }
      }

      if (allParsedSheets.length === 0) {
        throw new Error("Tidak ditemukan sheet data KPI yang dapat dibaca.");
      }

      setParsedSheets(allParsedSheets);
      setActiveSheetIndex(0);

      // Aktifkan data sheet pertama
      const firstSheet = allParsedSheets[0];
      if (firstSheet.matchedEmployee) {
        setIsPersonalMode(true);
        setSelectedEmployeeId(firstSheet.matchedEmployee.id);
        setDepartmentId(firstSheet.matchedEmployee.departmentId);
        setJobLevelId(firstSheet.matchedEmployee.jobLevelId);
      } else {
        if (firstSheet.departmentId) setDepartmentId(firstSheet.departmentId);
        if (firstSheet.jobLevelId) setJobLevelId(firstSheet.jobLevelId);
      }
      if (firstSheet.periodYear) setPeriodYear(firstSheet.periodYear);
      setCategories(firstSheet.categories);
      setUploadedFile(file);

      // Notifikasi ringkas hasil deteksi
      const matchedCount = allParsedSheets.filter((s) => s.matchedEmployee !== null).length;
      if (matchedCount > 0) {
        void Swal.fire({
          icon: "success",
          title: "File Excel Berhasil Dibaca",
          html: `<p>Membaca <b>${allParsedSheets.length} sheet</b>.</p><p class="text-xs text-slate-600 mt-1">Terdeteksi <b>${matchedCount} karyawan</b> yang cocok di sistem.</p>`,
          confirmButtonColor: "#2563eb",
          timer: 2500,
          timerProgressBar: true,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal membaca format file Excel.";
      void Swal.fire({
        icon: "error",
        title: "Gagal Membaca File",
        text: msg,
        confirmButtonColor: "#2563eb",
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      void parseExcelFile(selected);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      void parseExcelFile(e.dataTransfer.files[0]);
    }
  };

  // Berpindah antar sheet pada workbook yang sama
  const handleSwitchSheet = (idx: number) => {
    // Simpan data categories yang sedang diedit ke sheet aktif saat ini
    setParsedSheets((prev) =>
      prev.map((s, i) => (i === activeSheetIndex ? { ...s, categories } : s))
    );

    setActiveSheetIndex(idx);
    const target = parsedSheets[idx];
    if (target) {
      if (target.matchedEmployee) {
        setSelectedEmployeeId(target.matchedEmployee.id);
        setDepartmentId(target.matchedEmployee.departmentId);
        setJobLevelId(target.matchedEmployee.jobLevelId);
      } else {
        setSelectedEmployeeId("");
        if (target.departmentId) setDepartmentId(target.departmentId);
        if (target.jobLevelId) setJobLevelId(target.jobLevelId);
      }
      if (target.periodYear) setPeriodYear(target.periodYear);
      setCategories(target.categories);
    }
  };

  // Pilih manual karyawan pemilik template
  const handleSelectEmployee = (empId: number | "") => {
    setSelectedEmployeeId(empId);
    if (empId) {
      const emp = employees.find((e) => e.id === Number(empId));
      if (emp) {
        setDepartmentId(emp.departmentId);
        setJobLevelId(emp.jobLevelId);
      }
    }
  };

  // Tambah Parameter Utama Baru
  const handleAddCategory = () => {
    const newNum = categories.length + 1;
    setCategories((prev) => [
      ...prev,
      {
        id: `cat-${newNum}-${Date.now()}`,
        categoryNumber: newNum,
        name: `Parameter ${newNum}`,
        weight: 10,
        categoryType: "DIRECT",
        params: [
          {
            id: `param-${newNum}-${Date.now()}`,
            code: String(newNum),
            name: `${newNum}. Parameter ${newNum}`,
            description: "",
            internalWeight: 100,
            skor: 25,
            bands: [
              {
                id: `band-1`,
                label: "Target Tercapai",
                operator: "EQ",
                operatorSymbol: "=",
                criteriaValue: "100%",
                score: 25,
              },
            ],
          },
        ],
      },
    ]);
  };

  // Hapus Parameter Utama
  const handleDeleteCategory = (catId: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== catId));
  };

  // Update Parameter Utama (Nama atau Bobot)
  const handleUpdateCategory = (catId: string, field: "name" | "weight", val: any) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === catId ? { ...c, [field]: val } : c))
    );
  };

  // Tambah Sub Parameter pada Kategori Target Kerja
  const handleAddSubParam = (catId: string) => {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== catId) return c;
        const subIdx = c.params.length + 1;
        const newCode = `${c.categoryNumber || 1}.${subIdx}`;
        return {
          ...c,
          params: [
            ...c.params,
            {
              id: `param-${newCode}-${Date.now()}`,
              code: newCode,
              name: `${newCode} Sub Parameter Baru`,
              description: "",
              internalWeight: 25,
              skor: 25,
              bands: [
                {
                  id: `band-1`,
                  label: "> 95%",
                  operator: "GT",
                  operatorSymbol: ">",
                  criteriaValue: "95%",
                  score: 25,
                },
                {
                  id: `band-2`,
                  label: "= 95%",
                  operator: "EQ",
                  operatorSymbol: "=",
                  criteriaValue: "95%",
                  score: 15,
                },
                {
                  id: `band-3`,
                  label: "< 95%",
                  operator: "LT",
                  operatorSymbol: "<",
                  criteriaValue: "95%",
                  score: 5,
                },
              ],
            },
          ],
        };
      })
    );
  };

  // Hapus Sub Parameter
  const handleDeleteSubParam = (catId: string, paramId: string) => {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== catId) return c;
        return {
          ...c,
          params: c.params.filter((p) => p.id !== paramId),
        };
      })
    );
  };

  // Update data Sub Parameter / Indikator (Nama, Deskripsi, Bobot Internal)
  const handleUpdateParam = (
    catId: string,
    paramId: string,
    field: "name" | "description" | "internalWeight",
    val: any
  ) => {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== catId) return c;
        return {
          ...c,
          params: c.params.map((p) => (p.id === paramId ? { ...p, [field]: val } : p)),
        };
      })
    );
  };

  // Update data band tertentu pada parameter (Operator, Nilai Kriteria, atau Skor)
  const handleUpdateBand = (
    catId: string,
    paramId: string,
    bIdx: number,
    field: "operatorSymbol" | "criteriaValue" | "score",
    val: any
  ) => {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== catId) return c;
        return {
          ...c,
          params: c.params.map((p) => {
            if (p.id !== paramId) return p;
            const bands = [...p.bands];
            if (!bands[bIdx]) return p;

            const updatedBand = { ...bands[bIdx], [field]: val };

            if (field === "operatorSymbol") {
              const sym = String(val);
              updatedBand.operator =
                sym === ">="
                  ? "GTE"
                  : sym === ">"
                  ? "GT"
                  : sym === "<="
                  ? "LTE"
                  : sym === "<"
                  ? "LT"
                  : sym === "="
                  ? "EQ"
                  : sym === "Rentang"
                  ? "BETWEEN"
                  : "TEXT";
            }

            const sym = updatedBand.operatorSymbol || "Teks";
            const crit = updatedBand.criteriaValue || "";
            updatedBand.label = sym === "Teks" ? crit : `${sym} ${crit}`.trim();

            bands[bIdx] = updatedBand;
            const maxScore = Math.max(...bands.map((b) => Number(b.score) || 0));

            return {
              ...p,
              bands,
              skor: maxScore > 0 ? maxScore : p.skor,
            };
          }),
        };
      })
    );
  };

  // Tambah baris kriteria penilaian baru pada parameter
  const handleAddBand = (catId: string, paramId: string) => {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== catId) return c;
        return {
          ...c,
          params: c.params.map((p) => {
            if (p.id !== paramId) return p;
            const bands = [...p.bands];
            const lastScore = bands.length > 0 ? Number(bands[bands.length - 1].score) || 25 : 25;
            const newScore = Math.max(0, lastScore - 10);
            bands.push({
              id: `band-${Date.now()}-${bands.length + 1}`,
              label: "= 100%",
              operator: "EQ",
              operatorSymbol: "=",
              criteriaValue: "100%",
              score: newScore,
            });
            const maxScore = Math.max(...bands.map((b) => Number(b.score) || 0));
            return {
              ...p,
              bands,
              skor: maxScore > 0 ? maxScore : p.skor,
            };
          }),
        };
      })
    );
  };

  // Hapus baris kriteria penilaian tertentu dari parameter
  const handleDeleteBand = (catId: string, paramId: string, bIdx: number) => {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== catId) return c;
        return {
          ...c,
          params: c.params.map((p) => {
            if (p.id !== paramId) return p;
            const bands = p.bands.filter((_, idx) => idx !== bIdx);
            if (bands.length === 0) return p;
            const maxScore = Math.max(...bands.map((b) => Number(b.score) || 0));
            return {
              ...p,
              bands,
              skor: maxScore > 0 ? maxScore : p.skor,
            };
          }),
        };
      })
    );
  };

  // Kalkulasi Status & Validasi Keseluruhan
  const totalParameterBobot = useMemo(() => {
    return Math.round(categories.reduce((sum, c) => sum + (Number(c.weight) || 0), 0));
  }, [categories]);

  const cat1 = categories.find((c) => c.categoryNumber === 1 || c.categoryType === "SUB_ITEMS");
  const cat1InternalTotal = useMemo(() => {
    if (!cat1) return 100;
    return Math.round(cat1.params.reduce((sum, p) => sum + (Number(p.internalWeight) || 0), 0));
  }, [cat1]);

  const totalParamsCount = useMemo(() => {
    return categories.reduce((sum, c) => sum + c.params.length, 0);
  }, [categories]);

  const categoriesWithErrors = useMemo(() => {
    const errors: string[] = [];
    for (const c of categories) {
      if (!c.name.trim()) errors.push(`Parameter ${c.categoryNumber}: nama wajib diisi`);
      if (isNaN(c.weight) || c.weight <= 0) errors.push(`Parameter ${c.name || c.categoryNumber}: bobot harus > 0%`);
      for (const p of c.params) {
        if (!p.name.trim()) errors.push(`Indikator pada ${c.name}: nama wajib diisi`);
        if (!p.bands || p.bands.length === 0) errors.push(`${p.name}: kriteria penilaian minimal 1`);
        for (const b of p.bands) {
          if (isNaN(b.score) || b.score < 0) errors.push(`${p.name}: skor kriteria harus >= 0`);
        }
      }
    }
    return errors;
  }, [categories]);

  const isMetadataValid = isPersonalMode
    ? Boolean(selectedEmployeeId && periodYear.trim())
    : Boolean(departmentId && jobLevelId && periodYear.trim());

  const isDataValid = categories.length > 0 && categoriesWithErrors.length === 0;
  const isTotalBobotValid =
    totalParameterBobot === 115 ||
    totalParameterBobot === 100 ||
    (totalParameterBobot >= 80 && totalParameterBobot <= 150);

  const isCat1InternalValid =
    !cat1 || cat1.categoryType !== "SUB_ITEMS" || cat1InternalTotal === 100 || cat1InternalTotal === 0;

  const canSave = isMetadataValid && isDataValid && isTotalBobotValid && !isPending;

  // Nama template otomatis
  const selectedDept = departments.find((d) => d.id === Number(departmentId));
  const selectedLevel = jobLevels.find((l) => l.id === Number(jobLevelId));
  const templateName = useMemo(() => {
    if (isPersonalMode && selectedEmployee) {
      const jobTitle = selectedEmployee.jobPosition || "Karyawan";
      return `Template KPI ${selectedEmployee.name} - ${jobTitle} - ${periodYear.trim()}`;
    }
    const deptName = selectedDept?.name || "Departemen";
    const levelName = selectedLevel?.name || "Job_Level";
    return `KPI ${deptName} - ${levelName} - ${periodYear.trim()}`;
  }, [isPersonalMode, selectedEmployee, selectedDept, selectedLevel, periodYear]);

  // Handler Simpan Single Template (Personal Karyawan atau Master Standar)
  const handleSave = () => {
    if (!canSave) return;

    startTransition(async () => {
      try {
        const categoriesPayload = buildCategoriesPayloadFromDraft(categories);

        if (isPersonalMode && selectedEmployee) {
          const res = await savePersonalTemplateFromExcelAction({
            employeeId: selectedEmployee.id,
            templateName: templateName.trim(),
            categories: categoriesPayload,
            periodYear: periodYear.trim(),
          });

          if (!res.success || !res.templateId) {
            throw new Error(res.error || "Gagal menyimpan template personal karyawan.");
          }

          await Swal.fire({
            icon: "success",
            title: res.isUpdated ? "Template Karyawan Diperbarui" : "Template Karyawan Berhasil Dibuat",
            text: `Template KPI untuk ${selectedEmployee.name} (${selectedEmployee.nik}) berhasil disimpan dengan ${categories.length} Parameter (${totalParamsCount} Indikator) dan total bobot ${totalParameterBobot}%.`,
            confirmButtonColor: "#2563eb",
            timer: 2500,
            timerProgressBar: true,
          });

          onClose();
          if (onSuccess) {
            onSuccess(res.templateId);
          } else {
            router.push(`/setup/templates/${res.templateId}`);
            router.refresh();
          }
        } else {
          const res = await createTemplateFromExcel(
            templateName.trim(),
            Number(departmentId),
            Number(jobLevelId),
            categoriesPayload,
            periodYear.trim()
          );

          await Swal.fire({
            icon: "success",
            title: "Master Template Berhasil Disimpan",
            text: `Template "${res.name}" berhasil dibuat dengan ${categories.length} Parameter dan total bobot ${totalParameterBobot}%.`,
            confirmButtonColor: "#2563eb",
            timer: 2000,
            timerProgressBar: true,
          });

          onClose();
          if (onSuccess) {
            onSuccess(res.id);
          } else {
            router.push(`/setup/templates/${res.id}`);
            router.refresh();
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan template.";
        void Swal.fire({
          icon: "error",
          title: "Gagal Simpan Template",
          text: msg,
          confirmButtonColor: "#0f172a",
        });
      }
    });
  };

  // Handler Simpan Semua Sheet Sekaligus (Batch Import)
  const handleBatchSaveAllSheets = async () => {
    const sheetsWithEmployees = parsedSheets.filter((s) => s.matchedEmployee !== null);
    if (sheetsWithEmployees.length === 0) {
      void Swal.fire({
        icon: "warning",
        title: "Tidak Ada Karyawan Terdeteksi",
        text: "Pastikan sheet Excel memiliki data NIK dan Nama yang terdaftar di sistem.",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    const confirm = await Swal.fire({
      icon: "question",
      title: `Simpan ${sheetsWithEmployees.length} Template Karyawan?`,
      html: `<p>Sistem akan membuat atau memperbarui template KPI untuk <b>${sheetsWithEmployees.length} karyawan</b> sekaligus dengan struktur 5 Parameter dan total bobot 115%.</p>`,
      showCancelButton: true,
      confirmButtonText: "Ya, Simpan Semua",
      cancelButtonText: "Batal",
      confirmButtonColor: "#2563eb",
    });

    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      try {
        const inputs: SavePersonalTemplateFromExcelInput[] = sheetsWithEmployees.map((s) => {
          const emp = s.matchedEmployee!;
          const currentCats = s.sheetIndex === activeSheetIndex ? categories : s.categories;
          const catPayload = buildCategoriesPayloadFromDraft(currentCats);

          return {
            employeeId: emp.id,
            templateName: `Template KPI ${emp.name} - ${emp.jobPosition || "Karyawan"} - ${s.periodYear || periodYear}`,
            categories: catPayload,
            periodYear: s.periodYear || periodYear,
          };
        });

        const res = await batchSavePersonalTemplatesFromExcelAction(inputs);

        await Swal.fire({
          icon: res.success ? "success" : "warning",
          title: "Selesai Simpan Batch Template",
          text: `Berhasil menyimpan template untuk ${res.totalSaved} dari ${sheetsWithEmployees.length} karyawan.`,
          confirmButtonColor: "#2563eb",
        });

        onClose();
        router.push("/setup/templates");
        router.refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal memproses batch simpan.";
        void Swal.fire({
          icon: "error",
          title: "Gagal Simpan Batch",
          text: msg,
          confirmButtonColor: "#0f172a",
        });
      }
    });
  };

  const detectedEmployeesCount = useMemo(() => {
    return parsedSheets.filter((s) => s.matchedEmployee !== null).length;
  }, [parsedSheets]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={() => {
        if (!isPending) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-4 transition-all duration-200 flex flex-col max-h-[94vh] w-full max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">
                  Upload Template KPI dari Excel
                </h3>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                  Template per Employee
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Otomatis membaca data sheet, NIK, nama karyawan, dan parameter penilaian
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs bg-slate-50/40">
          {/* ================================================================= */}
          {/* SECTION 1: INFORMASI TEMPLATE & KARYAWAN                          */}
          {/* ================================================================= */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  1
                </span>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">Informasi Template & Karyawan</h4>
                  <p className="text-[11px] text-slate-500">
                    Tentukan target template untuk karyawan tertentu atau master standar jabatan.
                  </p>
                </div>
              </div>

              {/* Toggle Mode */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsPersonalMode(true)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    isPersonalMode
                      ? "bg-white text-blue-700 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Template per Employee</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPersonalMode(false)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    !isPersonalMode
                      ? "bg-white text-blue-700 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Master Standar Dept</span>
                </button>
              </div>
            </div>

            {/* Form Fields Section 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              {isPersonalMode ? (
                /* Mode Personal: Pilih Karyawan */
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Karyawan Pemilik Template <span className="text-rose-500">*</span>
                    </label>
                    {selectedEmployee && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        NIK: {selectedEmployee.nik}
                      </span>
                    )}
                  </div>
                  <select
                    value={selectedEmployeeId}
                    onChange={(e) => handleSelectEmployee(e.target.value ? Number(e.target.value) : "")}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-blue-600 focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Pilih Karyawan ({employees.length} terdaftar) --</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.nik}) {e.jobPosition ? `· ${e.jobPosition}` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedEmployee && (
                    <div className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-3">
                      <span>
                        Jabatan: <strong className="text-slate-700">{selectedEmployee.jobPosition || "-"}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        Departemen: <strong className="text-slate-700">{selectedDept?.name || "-"}</strong>
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                /* Mode Standar: Pilih Departemen & Job Level */
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Departemen <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : "")}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-blue-600 focus:outline-none cursor-pointer"
                    >
                      <option value="">-- Pilih Departemen --</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} {d.code ? `(${d.code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Job Level <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={jobLevelId}
                      onChange={(e) => setJobLevelId(e.target.value ? Number(e.target.value) : "")}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-blue-600 focus:outline-none cursor-pointer"
                    >
                      <option value="">-- Pilih Job Level --</option>
                      {jobLevels.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Periode */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Periode Penilaian <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={periodYear}
                    onChange={(e) => setPeriodYear(e.target.value)}
                    placeholder="2026"
                    className="w-full px-3 py-2 pr-9 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-blue-600 focus:outline-none"
                  />
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION 2: UPLOAD FILE EXCEL & MULTI-SHEET SELECTOR               */}
          {/* ================================================================= */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  2
                </span>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">Upload File Excel</h4>
                  <p className="text-[11px] text-slate-500">
                    Mendukung multi-sheet karyawan dengan pembacaan otomatis NIK, Nama, dan tabel indikator.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadTemplateExcel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold text-xs transition cursor-pointer"
                title="Unduh contoh template Excel siap isi"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Format Excel</span>
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />

            {uploadedFile ? (
              <div className="space-y-3">
                {/* File info card */}
                <div className="border border-emerald-300 bg-emerald-50/40 rounded-xl p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-xs truncate">
                        {uploadedFile.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {(uploadedFile.size / 1024).toFixed(1)} KB · {parsedSheets.length} sheet terdeteksi
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>File berhasil dibaca</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                    >
                      Ganti File
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUploadedFile(null);
                        setParsedSheets([]);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      title="Hapus file"
                      className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Multi-Sheet Selector Bar jika file memiliki 2 atau lebih sheet */}
                {parsedSheets.length > 1 && (
                  <div className="bg-blue-50/60 border border-blue-200/90 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-700" />
                        <span className="font-bold text-slate-900 text-xs">
                          Pilih Sheet Karyawan ({parsedSheets.length} Sheet)
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-md border border-blue-200">
                        Sheet Aktif: {activeSheetIndex + 1} / {parsedSheets.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={activeSheetIndex}
                        onChange={(e) => handleSwitchSheet(Number(e.target.value))}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                      >
                        {parsedSheets.map((s, idx) => {
                          const empTitle = s.matchedEmployee
                            ? `${s.matchedEmployee.name} (${s.matchedEmployee.nik})`
                            : s.detectedName || s.detectedNik
                            ? `${s.detectedName || "Tanpa Nama"} (${s.detectedNik || "-"})`
                            : s.sheetName;
                          return (
                            <option key={idx} value={idx}>
                              {s.sheetName} - {empTitle} • {s.categories.length} Parameter (Bobot: {s.totalParameterBobot}%)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/20 rounded-xl p-5 text-center cursor-pointer transition"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-2">
                  <Upload className="w-4 h-4" />
                </div>
                <p className="font-semibold text-slate-800 text-xs">
                  Tarik file Excel ke sini, atau klik untuk memilih file (.xlsx, .xls)
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Sistem otomatis mengekstrak sheet per karyawan, mencocokkan NIK & nama, serta membaca parameter
                </p>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* SECTION 3: REVIEW & PENYESUAIAN DATA                              */}
          {/* ================================================================= */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  3
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-900 text-xs">Review & Penyesuaian Data</h4>
                    {parsedSheets.length > 0 && (
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        Sheet: {parsedSheets[activeSheetIndex]?.sheetName}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Struktur 5 Parameter Utama dan Sub Parameter (Bobot Total: 115%, Sub Target Kerja: 100%).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold text-xs transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Parameter Utama</span>
                </button>
              </div>
            </div>

            {categories.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl text-slate-400 space-y-2">
                <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">Belum ada data Parameter KPI.</p>
                <p className="text-[11px] text-slate-400">
                  Upload file Excel di atas atau klik tombol <strong>Tambah Parameter Utama</strong> untuk mengisi manual.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-300 overflow-x-auto shadow-2xs bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 border-b border-slate-300 text-slate-800 text-[11px] font-bold">
                      <th className="py-2.5 px-3.5 min-w-[260px] border-r border-slate-200">
                        Parameter / Indikator <span className="text-rose-500">*</span>
                      </th>
                      <th className="py-2.5 px-2 w-28 text-center border-r border-slate-200">Operator</th>
                      <th className="py-2.5 px-3 min-w-[200px] border-r border-slate-200">
                        Kriteria Penilaian <span className="text-rose-500">*</span>
                      </th>
                      <th className="py-2.5 px-2 w-20 text-center border-r border-slate-200">
                        Skor <span className="text-rose-500">*</span>
                      </th>
                      <th className="py-2.5 px-3 w-28 text-center border-r border-slate-200">
                        Bobot (%) <span className="text-rose-500">*</span>
                      </th>
                      <th className="py-2.5 px-2 w-14 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    {categories.map((cat, catIdx) => {
                      const isSubItemsCat = cat.categoryType === "SUB_ITEMS" || cat.categoryNumber === 1;
                      const isCatWeightInvalid = isNaN(cat.weight) || cat.weight <= 0;

                      return (
                        <React.Fragment key={cat.id}>
                          {/* Category Ribbon Header Banner (Mirip tampilan KpiExcelTable) */}
                          <tr className="border-y border-sky-200 bg-sky-50/80 text-slate-900">
                            <td colSpan={3} className="px-3.5 py-2 border-r border-sky-200">
                              <div className="flex items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="font-bold text-blue-800 text-xs shrink-0 select-none">
                                    {cat.categoryNumber || catIdx + 1}.
                                  </span>
                                  <input
                                    type="text"
                                    value={cat.name}
                                    onChange={(e) => handleUpdateCategory(cat.id, "name", e.target.value)}
                                    placeholder="Nama Parameter Utama"
                                    className="font-bold text-slate-900 text-xs bg-transparent hover:bg-white/80 focus:bg-white border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-1.5 py-0.5 transition flex-1 min-w-0"
                                  />
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    <span>Aktif</span>
                                  </span>
                                  <span className="text-[11px] text-slate-500 font-medium shrink-0">
                                    {cat.params.length} Indikator · {cat.params.reduce((s, p) => s + (p.bands?.length || 1), 0)} Kriteria
                                  </span>
                                  {isSubItemsCat && (
                                    <span
                                      className={`text-[11px] font-bold px-2 py-0.5 rounded border shrink-0 ${
                                        cat1InternalTotal === 100
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                          : "bg-amber-50 text-amber-700 border-amber-200"
                                      }`}
                                    >
                                      Bobot Sub: {cat1InternalTotal}% / 100%
                                    </span>
                                  )}
                                </div>
                                {isSubItemsCat && (
                                  <button
                                    type="button"
                                    onClick={() => handleAddSubParam(cat.id)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded shadow-2xs transition cursor-pointer shrink-0"
                                    title="Tambah Sub Parameter Baru"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Tambah Sub</span>
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center text-slate-400 font-mono text-xs border-r border-sky-200">
                              -
                            </td>
                            <td className="px-2 py-2 text-center border-r border-sky-200">
                              <div className="inline-flex items-center justify-center gap-1">
                                <span className="text-[11px] font-medium text-slate-500">Bobot:</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="any"
                                  value={cat.weight === 0 ? "" : cat.weight}
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? 0 : Number(e.target.value);
                                    handleUpdateCategory(cat.id, "weight", val);
                                  }}
                                  placeholder="65"
                                  className={`w-12 h-7 px-1 text-center font-bold font-mono text-xs rounded border bg-white text-slate-900 focus:outline-none transition ${
                                    isCatWeightInvalid
                                      ? "border-rose-400 bg-rose-50/20"
                                      : "border-blue-300 focus:border-blue-600"
                                  }`}
                                />
                                <span className="font-bold text-xs text-blue-900 font-mono">%</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center">
                              {categories.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCategory(cat.id)}
                                  title="Hapus parameter utama ini"
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-white/80 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 mx-auto" />
                                </button>
                              )}
                            </td>
                          </tr>

                          {/* Child Rows for Indicators & Criteria */}
                          {cat.params.map((param, pIdx) => {
                            const bands =
                              param.bands && param.bands.length > 0
                                ? param.bands
                                : [
                                    {
                                      id: `band-${param.id}-1`,
                                      label: "Target",
                                      operator: "GTE",
                                      operatorSymbol: ">=",
                                      criteriaValue: "100%",
                                      score: param.skor || 25,
                                    },
                                  ];
                            const paramRowSpan = bands.length;
                            const isParamInternalBobotInvalid =
                              isSubItemsCat && (isNaN(param.internalWeight) || param.internalWeight <= 0);

                            return (
                              <React.Fragment key={param.id}>
                                {bands.map((band, bIdx) => {
                                  const isFirstRowOfParam = bIdx === 0;
                                  const isLastRowOfParam = bIdx === bands.length - 1;
                                  const isBandScoreInvalid = isNaN(band.score) || band.score < 0;

                                  return (
                                    <tr
                                      key={`${param.id}-band-${bIdx}`}
                                      className={`hover:bg-slate-50/70 transition ${
                                        isLastRowOfParam && pIdx === cat.params.length - 1
                                          ? "border-b border-slate-300"
                                          : isLastRowOfParam
                                          ? "border-b border-slate-200"
                                          : "border-b border-slate-100"
                                      }`}
                                    >
                                      {/* 1. Parameter / Indikator (Parameter level rowSpan) */}
                                      {isFirstRowOfParam && (
                                        <td
                                          rowSpan={paramRowSpan}
                                          className="py-2.5 px-3.5 align-top border-r border-slate-200 bg-white"
                                        >
                                          <div className="space-y-1">
                                            <input
                                              type="text"
                                              value={param.name}
                                              onChange={(e) =>
                                                handleUpdateParam(cat.id, param.id, "name", e.target.value)
                                              }
                                              placeholder={
                                                isSubItemsCat
                                                  ? "Contoh: 1.1 Pemenuhan Kebutuhan User"
                                                  : cat.name
                                              }
                                              className="w-full px-2 py-1 text-xs font-semibold text-slate-900 rounded border border-slate-200 hover:border-slate-300 focus:border-blue-600 focus:outline-none transition"
                                            />
                                            {param.description && (
                                              <p className="text-[11px] text-slate-500 italic pl-1">
                                                Target: {param.description}
                                              </p>
                                            )}
                                          </div>
                                        </td>
                                      )}

                                      {/* 2. Operator (Per Line) */}
                                      <td className="py-1.5 px-2 text-center border-r border-slate-200 align-middle bg-white">
                                        <select
                                          value={band.operatorSymbol || "Teks"}
                                          onChange={(e) =>
                                            handleUpdateBand(
                                              cat.id,
                                              param.id,
                                              bIdx,
                                              "operatorSymbol",
                                              e.target.value
                                            )
                                          }
                                          className="w-full h-7 px-1.5 py-0.5 text-xs font-mono font-semibold text-center rounded border border-slate-200 bg-white text-slate-800 focus:border-blue-600 focus:outline-none cursor-pointer"
                                        >
                                          <option value=">=">&gt;= (≥)</option>
                                          <option value=">">&gt;</option>
                                          <option value="<=">&lt;= (≤)</option>
                                          <option value="<">&lt;</option>
                                          <option value="=">=</option>
                                          <option value="Rentang">Rentang</option>
                                          <option value="Teks">Teks</option>
                                        </select>
                                      </td>

                                      {/* 3. Kriteria Penilaian (Per Line) */}
                                      <td className="py-1.5 px-3 border-r border-slate-200 align-middle bg-white">
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            type="text"
                                            value={band.criteriaValue ?? band.label}
                                            onChange={(e) =>
                                              handleUpdateBand(
                                                cat.id,
                                                param.id,
                                                bIdx,
                                                "criteriaValue",
                                                e.target.value
                                              )
                                            }
                                            placeholder="Contoh: 95%, <= 3%, Tidak ada SP"
                                            className="w-full h-7 px-2 py-0.5 text-xs rounded border border-slate-200 bg-white text-slate-900 focus:border-blue-600 focus:outline-none transition"
                                          />
                                          {bands.length > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteBand(cat.id, param.id, bIdx)}
                                              title="Hapus baris kriteria ini"
                                              className="p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition shrink-0 cursor-pointer"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      </td>

                                      {/* 4. Skor (Per Line) */}
                                      <td className="py-1.5 px-2 text-center border-r border-slate-200 align-middle font-mono bg-white">
                                        <input
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="any"
                                          value={band.score === 0 ? "0" : band.score || ""}
                                          onChange={(e) => {
                                            const val = e.target.value === "" ? 0 : Number(e.target.value);
                                            handleUpdateBand(cat.id, param.id, bIdx, "score", val);
                                          }}
                                          placeholder="25"
                                          className={`w-14 h-7 px-1 py-0.5 text-xs text-center font-bold rounded border text-slate-900 focus:outline-none transition ${
                                            isBandScoreInvalid
                                              ? "border-rose-400 bg-rose-50/30"
                                              : "border-slate-200 focus:border-blue-600 bg-white"
                                          }`}
                                        />
                                      </td>

                                      {/* 5. Bobot (%) (Parameter level rowSpan) */}
                                      {isFirstRowOfParam && (
                                        <td
                                          rowSpan={paramRowSpan}
                                          className="py-2 px-3 text-center border-r border-slate-200 align-top bg-white"
                                        >
                                          {isSubItemsCat ? (
                                            <div className="inline-flex items-center justify-center gap-0.5">
                                              <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                step="any"
                                                value={
                                                  param.internalWeight === 0 && !param.name
                                                    ? ""
                                                    : param.internalWeight
                                                }
                                                onChange={(e) => {
                                                  const val =
                                                    e.target.value === "" ? 0 : Number(e.target.value);
                                                  handleUpdateParam(
                                                    cat.id,
                                                    param.id,
                                                    "internalWeight",
                                                    val
                                                  );
                                                }}
                                                placeholder="25"
                                                className={`w-12 h-7 px-1 py-0.5 text-xs text-center font-bold font-mono rounded border text-slate-900 focus:outline-none transition ${
                                                  isParamInternalBobotInvalid
                                                    ? "border-rose-400 bg-rose-50/20"
                                                    : "border-slate-200 focus:border-blue-600 bg-white"
                                                }`}
                                              />
                                              <span className="font-bold text-xs text-slate-500 font-mono">%</span>
                                            </div>
                                          ) : (
                                            <span className="inline-block px-2 py-1 text-xs font-semibold text-slate-500">
                                              100%
                                            </span>
                                          )}
                                        </td>
                                      )}

                                      {/* 6. Aksi (Parameter level rowSpan) */}
                                      {isFirstRowOfParam && (
                                        <td
                                          rowSpan={paramRowSpan}
                                          className="py-2 px-2 text-center align-top bg-white"
                                        >
                                          {isSubItemsCat && cat.params.length > 1 ? (
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteSubParam(cat.id, param.id)}
                                              title="Hapus sub parameter ini"
                                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                            >
                                              <Trash2 className="w-3.5 h-3.5 mx-auto" />
                                            </button>
                                          ) : null}
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  {/* Table Footer: Total Row */}
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-900 text-xs">
                      <td colSpan={4} className="py-2.5 px-4 text-right uppercase tracking-wider text-[11px] text-slate-600">
                        Total Bobot Parameter
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded font-bold text-xs ${
                            isTotalBobotValid
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {totalParameterBobot}%
                        </span>
                        {cat1 && (
                          <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                            Sub Target Kerja:{" "}
                            <strong className={isCat1InternalValid ? "text-emerald-700" : "text-amber-700"}>
                              {cat1InternalTotal}%
                            </strong>
                          </div>
                        )}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* SECTION 4: VALIDASI DATA & RINGKASAN                              */}
          {/* ================================================================= */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Validasi Data Checklist */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5">
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  4
                </span>
                <h4 className="font-bold text-slate-900 text-xs">Validasi Data</h4>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* 1. Format File */}
                <div className="flex items-start gap-2.5">
                  {uploadedFile ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold text-slate-800">Format berkas valid</span>
                    <p className="text-[11px] text-slate-500">
                      {uploadedFile
                        ? `File Excel dibaca (${parsedSheets.length} sheet terdeteksi).`
                        : "Data dapat dimasukkan langsung tanpa file."}
                    </p>
                  </div>
                </div>

                {/* 2. Target Karyawan / Departemen */}
                <div className="flex items-start gap-2.5">
                  {isMetadataValid ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold text-slate-800">
                      {isPersonalMode ? "Karyawan Terpilih" : "Departemen & Job Level"}
                    </span>
                    <p className="text-[11px] text-slate-500">
                      {isPersonalMode
                        ? selectedEmployee
                          ? `Terhubung ke ${selectedEmployee.name} (${selectedEmployee.nik}).`
                          : "Pilih karyawan pemilik template."
                        : isMetadataValid
                        ? "Departemen dan job level valid."
                        : "Pilih departemen dan job level."}
                    </p>
                  </div>
                </div>

                {/* 3. Data KPI */}
                <div className="flex items-start gap-2.5">
                  {categories.length > 0 && categoriesWithErrors.length === 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold text-slate-800">Data Parameter KPI</span>
                    <p className="text-[11px] text-slate-500">
                      {categories.length === 0
                        ? "Belum ada parameter KPI."
                        : categoriesWithErrors.length === 0
                        ? `${categories.length} Parameter (${totalParamsCount} Indikator) valid.`
                        : `Terdapat ${categoriesWithErrors.length} item yang perlu diperbaiki.`}
                    </p>
                  </div>
                </div>

                {/* 4. Total Bobot */}
                <div className="flex items-start gap-2.5">
                  {isTotalBobotValid && isCat1InternalValid ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold text-slate-800">Total bobot</span>
                    <p className="text-[11px]">
                      {isTotalBobotValid && isCat1InternalValid ? (
                        <span className="text-emerald-700 font-semibold">
                          Total parameter {totalParameterBobot}% dan Bobot sub {cat1InternalTotal}%.
                        </span>
                      ) : (
                        <span className="text-amber-700 font-semibold">
                          Total parameter {totalParameterBobot}% (target: 115%), Sub Target Kerja {cat1InternalTotal}% (target: 100%).
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Ringkasan Metrics */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-3">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-blue-600" />
                  <h4 className="font-bold text-slate-900 text-xs">Ringkasan Sheet Aktif</h4>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Pemilik Template</span>
                    <span className="font-bold text-slate-900 text-xs truncate max-w-[220px]">
                      {isPersonalMode && selectedEmployee
                        ? `${selectedEmployee.name} (${selectedEmployee.nik})`
                        : "Master Standar Departemen"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Jumlah Parameter</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {categories.length} Parameter ({totalParamsCount} Indikator)
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Bobot Parameter</span>
                    <span
                      className={`font-bold text-sm ${
                        isTotalBobotValid ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {totalParameterBobot}%
                    </span>
                  </div>

                  {cat1 && (
                    <div className="flex items-center justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Bobot Sub Target Kerja</span>
                      <span
                        className={`font-bold text-sm ${
                          isCat1InternalValid ? "text-emerald-600" : "text-amber-600"
                        }`}
                      >
                        {cat1InternalTotal}% / 100%
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-500">Status</span>
                    {canSave ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Valid & Siap Disimpan
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        Perlu Dilengkapi
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!canSave && (
                <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-3 flex items-start gap-2 text-[11px] text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    {!isTotalBobotValid ? (
                      <>
                        <strong className="block font-bold">Total bobot belum sesuai target.</strong>
                        <span>Sesuaikan bobot parameter pada tabel di atas hingga total menjadi 115% (atau 100%).</span>
                      </>
                    ) : !isCat1InternalValid ? (
                      <>
                        <strong className="block font-bold">Bobot sub parameter belum 100%.</strong>
                        <span>Sesuaikan bobot internal sub parameter Target Kerja hingga total menjadi 100%.</span>
                      </>
                    ) : isPersonalMode && !selectedEmployeeId ? (
                      <>
                        <strong className="block font-bold">Karyawan belum dipilih.</strong>
                        <span>Pilih karyawan pemilik template pada bagian informasi di atas.</span>
                      </>
                    ) : (
                      <>
                        <strong className="block font-bold">Data belum lengkap.</strong>
                        <span>Lengkapi seluruh kolom parameter yang ditandai merah.</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer"
          >
            Batal
          </button>

          <div className="flex items-center gap-2.5">
            {/* Opsi Batch Save jika ada lebih dari 1 sheet dengan karyawan cocok */}
            {detectedEmployeesCount > 1 && (
              <button
                type="button"
                onClick={handleBatchSaveAllSheets}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-blue-600 text-blue-700 hover:bg-blue-50 text-xs font-bold transition cursor-pointer"
                title={`Simpan template untuk ${detectedEmployeesCount} karyawan sekaligus`}
              >
                <Users className="w-4 h-4" />
                <span>Simpan Semua Sheet ({detectedEmployeesCount} Karyawan)</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className={`inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-bold transition active:scale-95 ${
                canSave
                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
                  : "bg-slate-300 text-slate-500 cursor-not-allowed select-none opacity-80"
              }`}
            >
              {isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Menyimpan Template...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isPersonalMode && selectedEmployee
                      ? `Simpan Template ${selectedEmployee.name}`
                      : "Simpan Master Template"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
