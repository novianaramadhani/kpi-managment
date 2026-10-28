"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Plus,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  FolderTree,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Info,
  Pencil,
  Trash2,
  Copy,
  Loader2,
  BookOpen,
  Sparkles,
  Search,
  Check,
} from "lucide-react";
import type {
  KpiCategory,
  KpiParameter,
  KpiBand,
  Department,
  KpiCalculationRule,
  KpiMeasurementType,
  KpiDirection,
  KpiScoringMethod,
} from "@/db/schema";
import Swal from "sweetalert2";
import { IndicatorModal } from "./indicator-modal";
import { KpiModernSpreadsheet } from "./kpi-modern-spreadsheet";
import { KpiExcelTable, renderBandCriteriaText, checkBandIntegrity } from "../kpi-excel-table";
import type { MasterParamItem } from "@/lib/excel-template-kpi";
import { validateStructuredCriteria, type CriteriaItem } from "@/lib/kpi-criteria-helper";
import { MasterParameterPickerModal } from "./master-parameter-picker-modal";

export type IssueSeverity = "INFO" | "WARNING" | "ERROR";

export interface ValidationIssue {
  id: string;
  severity: IssueSeverity;
  type:
    | "PARAMETER_WEIGHT"
    | "INDICATOR_WEIGHT"
    | "NO_INDICATORS"
    | "NO_BANDS"
    | "BAND_GAP_OVERLAP"
    | "FORMULA_MISSING";
  title: string;
  description: string;
  categoryId: number;
  indicatorId?: number;
  bandId?: number;
}

interface KpiStructureFormProps {
  templateId: number;
  categories: KpiCategory[]; // Level 1: Kategori
  parameters: KpiParameter[]; // Level 2: Indikator
  bands: KpiBand[]; // Level 3: Skala Nilai / Kriteria
  department?: Department;
  templateTargetPct?: number; // e.g. 115%
  masterParams?: MasterParamItem[];
  calculationRules?: KpiCalculationRule[];
  addCategoryAction: (fd: FormData) => Promise<void>;
  updateCategoryAction: (fd: FormData) => Promise<void>;
  deleteCategoryAction: (fd: FormData) => Promise<void>;
  addParameterAction: (fd: FormData) => Promise<void>;
  updateParameterAction: (fd: FormData) => Promise<void>;
  deleteParameterAction: (fd: FormData) => Promise<void>;
  isEditTemplateMode?: boolean;
  onToggleEditTemplateMode?: () => void;
  addBandAction: (fd: FormData) => Promise<void>;
  updateBandAction?: (fd: FormData) => Promise<void>;
  deleteBandAction: (fd: FormData) => Promise<void>;
}

export function KpiStructureForm({
  templateId,
  categories,
  parameters,
  bands,
  department,
  templateTargetPct = 115,
  masterParams = [],
  calculationRules = [],
  isEditTemplateMode: externalEditTemplateMode,
  onToggleEditTemplateMode: externalToggleEditTemplateMode,
  addCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  addParameterAction,
  updateParameterAction,
  deleteParameterAction,
  addBandAction,
  updateBandAction,
  deleteBandAction,
}: KpiStructureFormProps) {
  // Modal Indikator & Skala Nilai State
  const [indicatorModalState, setIndicatorModalState] = useState<{
    isOpen: boolean;
    categoryId: number;
    editingIndicator?: KpiParameter | null;
    initialTab?: "info" | "scoring";
  }>({
    isOpen: false,
    categoryId: 0,
    editingIndicator: null,
    initialTab: "info",
  });

  // Modal Tambah / Edit Kategori State
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [catNameInput, setCatNameInput] = useState("");
  const [catWeightInput, setCatWeightInput] = useState("20");
  const [catModeInput, setCatModeInput] = useState<"DIRECT" | "SUB_ITEMS">("SUB_ITEMS");

  // Kamus Master Parameter Picker State
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // Filter Kamus per Departemen & General
  const currentDeptId = department?.id ?? null;
  const deptMasterParams = useMemo(() => {
    if (!currentDeptId) return [];
    return masterParams.filter((p) => p.departmentId === currentDeptId);
  }, [masterParams, currentDeptId]);

  const generalMasterParams = useMemo(() => {
    return masterParams.filter((p) => !p.departmentId);
  }, [masterParams]);

  const allRelevantMasterParams = useMemo(() => {
    return masterParams.filter(
      (p) => !p.departmentId || (currentDeptId && p.departmentId === currentDeptId)
    );
  }, [masterParams, currentDeptId]);

  const handleSelectFromKamus = (paramId: string | number) => {
    if (!paramId) return;
    const p = masterParams.find((x) => String(x.id) === String(paramId));
    if (!p) return;

    setCatNameInput(p.name);

    if (catModeInput === "DIRECT") {
      if (p.unit) setCatUnit(p.unit);
      setCatTarget("100");
      if (p.inputType === "PERCENTAGE") setCatMeasurementType("PERCENTAGE");
      else if (p.inputType === "NUMERIC") setCatMeasurementType("NUMERIC");

      if (p.defaultBands && Array.isArray(p.defaultBands) && p.defaultBands.length > 0) {
        const loadedBands: FormCatBand[] = p.defaultBands.map((b: any, idx: number) => ({
          id: `cb-${idx}`,
          operator: b.operator || "GTE",
          minValue: b.minValue !== null && b.minValue !== undefined ? String(b.minValue) : "",
          maxValue: b.maxValue !== null && b.maxValue !== undefined ? String(b.maxValue) : "",
          score: b.score !== null && b.score !== undefined ? String(b.score) : "25",
        }));
        setCatBands(loadedBands);
      }
    }
  };

  const handleAddSingleParamFromKamus = async (p: MasterParamItem) => {
    let targetCat = categories.find(
      (c) =>
        c.name.toLowerCase().includes("target") ||
        (p.categoryName && c.name.toLowerCase().includes(p.categoryName.toLowerCase())) ||
        c.categoryType === "SUB_ITEMS"
    );

    if (targetCat) {
      const fd = new FormData();
      fd.append("categoryId", String(targetCat.id));
      fd.append("templateId", String(templateId));
      fd.append("name", p.name);
      fd.append("masterParameterId", String(p.id));
      fd.append("description", p.description || "");
      fd.append("unit", p.unit || "%");
      fd.append("target", "100");
      fd.append("weight", "20");
      fd.append("picRole", p.picRole || "HEAD_DEPT");
      fd.append("measurementType", p.inputType === "PERCENTAGE" ? "PERCENTAGE" : "NUMERIC");
      fd.append("direction", "HIGHER_IS_BETTER");
      fd.append("scoringMethod", "CRITERIA_BASED");

      if (p.defaultBands && Array.isArray(p.defaultBands) && p.defaultBands.length > 0) {
        fd.append("bands", JSON.stringify(p.defaultBands));
      }

      await addParameterAction(fd);
      void Swal.fire({
        icon: "success",
        title: "Indikator Ditambahkan",
        text: `Indikator "${p.name}" berhasil ditambahkan ke kategori "${targetCat.name}".`,
        timer: 1500,
        showConfirmButton: false,
      });
    } else {
      const nextSortOrder = categories.reduce((max, c) => Math.max(max, c.sortOrder ?? 0), 0) + 1;
      const catName = p.categoryName || "Target Kerja";
      const fdCat = new FormData();
      fdCat.append("templateId", String(templateId));
      fdCat.append("name", catName);
      fdCat.append("weight", categories.length === 0 ? "65" : "20");
      fdCat.append("categoryType", "SUB_ITEMS");
      fdCat.append("sortOrder", String(nextSortOrder));
      await addCategoryAction(fdCat);

      void Swal.fire({
        icon: "success",
        title: "Kategori Dibuat",
        text: `Kategori "${catName}" berhasil dibuat. Klik "Tambah ke Template" lagi untuk memasukkan indikator "${p.name}".`,
        timer: 2000,
        showConfirmButton: false,
      });
    }
  };

  const handleApplyAllDeptParams = async () => {
    if (deptMasterParams.length === 0) return;

    const confirm = await Swal.fire({
      icon: "question",
      title: `Terapkan Kamus ${department?.name || "Departemen"}?`,
      text: `Sistem akan membuat kategori "Target Kerja" berisi ${deptMasterParams.length} indikator kamus, serta kategori standar corporate pendukung (Kehadiran, Safety, SP, Inovasi).`,
      showCancelButton: true,
      confirmButtonText: "Ya, Terapkan",
      cancelButtonText: "Batal",
      confirmButtonColor: "#2563eb",
    });

    if (!confirm.isConfirmed) return;

    const fdCat1 = new FormData();
    fdCat1.append("templateId", String(templateId));
    fdCat1.append("name", "Target Kerja");
    fdCat1.append("weight", "65");
    fdCat1.append("categoryType", "SUB_ITEMS");
    fdCat1.append("sortOrder", "1");
    await addCategoryAction(fdCat1);

    const standardGeneralParams = [
      { name: "Kehadiran & Disiplin", weight: 10, sortOrder: 2 },
      { name: "Keselamatan Kerja", weight: 10, sortOrder: 3 },
      { name: "Kepatuhan dan SP", weight: 10, sortOrder: 4 },
      { name: "Inovasi dan Improvement", weight: 10, sortOrder: 5 },
    ];

    for (const gp of standardGeneralParams) {
      const fdGp = new FormData();
      fdGp.append("templateId", String(templateId));
      fdGp.append("name", gp.name);
      fdGp.append("weight", String(gp.weight));
      fdGp.append("categoryType", "DIRECT");
      fdGp.append("sortOrder", String(gp.sortOrder));
      fdGp.append("measurementType", "PERCENTAGE");
      fdGp.append("unit", "%");
      fdGp.append("direction", "HIGHER_IS_BETTER");
      fdGp.append("target", "100");
      fdGp.append("scoringMethod", "CRITERIA_BASED");
      fdGp.append(
        "bands",
        JSON.stringify([
          { operator: "GTE", minValue: "100", maxValue: null, score: "25", label: ">= 100%" },
          { operator: "BETWEEN", minValue: "95", maxValue: "99", score: "15", label: "95% - 99%" },
          { operator: "LT", minValue: null, maxValue: "95", score: "5", label: "< 95%" },
        ])
      );
      await addCategoryAction(fdGp);
    }

    void Swal.fire({
      icon: "success",
      title: "Struktur Berhasil Diterapkan",
      text: `Kategori Target Kerja dan indikator kamus telah berhasil dibuat. Silakan tambahkan indikator dari kamus di bawah.`,
      timer: 2000,
      showConfirmButton: false,
    });
  };

  // KPI Configuration Integration from API
  const [configMeasurementTypes, setConfigMeasurementTypes] = useState<KpiMeasurementType[]>([]);
  const [configDirections, setConfigDirections] = useState<KpiDirection[]>([]);
  const [configScoringMethods, setConfigScoringMethods] = useState<KpiScoringMethod[]>([]);
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Field Tambahan saat Parameter Langsung Dicentang (DIRECT)
  const [catMeasurementType, setCatMeasurementType] = useState("PERCENTAGE");
  const [catUnit, setCatUnit] = useState("%");
  const [catDirection, setCatDirection] = useState("HIGHER_IS_BETTER");
  const [catTarget, setCatTarget] = useState("100");
  const [catScoringMethod, setCatScoringMethod] = useState("CRITERIA_BASED");
  const [catFormulaId, setCatFormulaId] = useState<number | null>(null);

  // Kriteria Penilaian saat Scoring Method = Criteria Based
  interface FormCatBand {
    id: string;
    operator: "GTE" | "GT" | "LTE" | "LT" | "EQ" | "BETWEEN" | "NEQ" | "CONTAINS" | "TEXT";
    minValue: string;
    maxValue: string;
    score: string;
  }

  const [catBands, setCatBands] = useState<FormCatBand[]>([
    { id: "b-1", operator: "GTE", minValue: "100", maxValue: "", score: "25" },
    { id: "b-2", operator: "BETWEEN", minValue: "95", maxValue: "99", score: "15" },
    { id: "b-3", operator: "LT", minValue: "", maxValue: "95", score: "5" },
  ]);

  // Fetch KPI Configuration from API
  const fetchKpiConfig = async () => {
    setIsConfigLoading(true);
    setConfigError(null);
    try {
      const res = await fetch("/api/admin/kpi-config");
      const json = await res.json();
      if (json.success && json.config) {
        const mts: KpiMeasurementType[] = json.config.measurementTypes || [];
        const dirs: KpiDirection[] = json.config.directions || [];
        const sms: KpiScoringMethod[] = json.config.scoringMethods || [];
        setConfigMeasurementTypes(mts);
        setConfigDirections(dirs);
        setConfigScoringMethods(sms);

        if (mts.length > 0 && !catMeasurementType) {
          setCatMeasurementType(mts[0].code);
          if (mts[0].defaultUnit) setCatUnit(mts[0].defaultUnit);
        }
        if (dirs.length > 0 && !catDirection) {
          setCatDirection(dirs[0].code);
        }
        if (sms.length > 0 && !catScoringMethod) {
          setCatScoringMethod(sms[0].code);
        }
      } else {
        setConfigError(json.error || "Gagal memuat konfigurasi KPI.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memuat konfigurasi KPI.";
      setConfigError(msg);
    } finally {
      setIsConfigLoading(false);
    }
  };

  useEffect(() => {
    void fetchKpiConfig();
  }, []);

  const handleMeasurementTypeChange = (newCode: string) => {
    setCatMeasurementType(newCode);
    if (newCode === "TEXT") {
      setCatUnit("Teks");
      setCatDirection("NOT_APPLICABLE");
      if (!catTarget || catTarget === "100" || catTarget === "0" || catTarget === "25000000") {
        setCatTarget("Memenuhi");
      }
      setCatBands([
        { id: "b-1", operator: "EQ", minValue: "Memenuhi", maxValue: "", score: "25" },
        { id: "b-2", operator: "EQ", minValue: "Sebagian Memenuhi", maxValue: "", score: "15" },
        { id: "b-3", operator: "EQ", minValue: "Tidak Memenuhi", maxValue: "", score: "5" },
      ]);
    } else {
      const matched = configMeasurementTypes.find((m) => m.code === newCode);
      if (matched && matched.defaultUnit) {
        setCatUnit(matched.defaultUnit);
      } else {
        setCatUnit(newCode === "PERCENTAGE" ? "%" : newCode === "CURRENCY" ? "IDR" : "");
      }
      if (catDirection === "NOT_APPLICABLE") {
        setCatDirection(
          configDirections.find((d) => d.code !== "NOT_APPLICABLE")?.code || "HIGHER_IS_BETTER"
        );
      }
      if (catTarget === "Memenuhi") {
        setCatTarget(newCode === "PERCENTAGE" ? "100" : newCode === "CURRENCY" ? "25000000" : "100");
      }
      setCatBands([
        { id: "b-1", operator: "GTE", minValue: "100", maxValue: "", score: "25" },
        { id: "b-2", operator: "BETWEEN", minValue: "95", maxValue: "99", score: "15" },
        { id: "b-3", operator: "LT", minValue: "", maxValue: "95", score: "5" },
      ]);
    }
  };

  const handleAddCatBand = () => {
    const isText = catMeasurementType === "TEXT";
    setCatBands((prev) => [
      ...prev,
      {
        id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        operator: isText ? "EQ" : "GTE",
        minValue: "",
        maxValue: "",
        score: "25",
      },
    ]);
  };

  const handleRemoveCatBand = (id: string) => {
    setCatBands((prev) => prev.filter((b) => b.id !== id));
  };

  const handleUpdateCatBand = (
    id: string,
    field: "operator" | "minValue" | "maxValue" | "score",
    val: string
  ) => {
    setCatBands((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [field]: val } : b))
    );
  };

  // Highlighted row from issue click / newly added item
  const [highlightedIds, setHighlightedIds] = useState<{
    categoryId?: number;
    parameterId?: number;
    bandId?: number;
  }>({});

  // Accordion state: Set of open category IDs (Level Kategori)
  const [expandedCatIds, setExpandedCatIds] = useState<Set<number>>(
    () => new Set<number>(categories.map((c) => c.id))
  );

  const handleToggleCategory = (catId: number) => {
    setExpandedCatIds((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  };

  const handleExpandAllCategories = () => {
    setExpandedCatIds(new Set(categories.map((c) => c.id)));
  };

  const handleCollapseAllCategories = () => {
    setExpandedCatIds(new Set());
  };

  // State Mode Edit Template
  const [internalEditTemplateMode, setInternalEditTemplateMode] = useState(false);
  const isEditTemplateMode =
    externalEditTemplateMode !== undefined ? externalEditTemplateMode : internalEditTemplateMode;
  const handleToggleEditTemplateMode = () => {
    if (!isEditTemplateMode) {
      handleExpandAllCategories();
    }
    if (externalToggleEditTemplateMode) {
      externalToggleEditTemplateMode();
    } else {
      setInternalEditTemplateMode((prev) => !prev);
    }
  };

  // Auto-expand all categories when entering edit mode so all rows are visible
  useEffect(() => {
    if (isEditTemplateMode && categories.length > 0) {
      handleExpandAllCategories();
    }
  }, [isEditTemplateMode]);

  // Guide Popover & Input Refs
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const guideRef = useRef<HTMLDivElement>(null);
  const issuesContainerRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input nama kategori saat form inline dibuka
  useEffect(() => {
    if (isAddingCategory) {
      const timer = setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isAddingCategory]);

  // Track previous category and parameter IDs to detect new creations and auto-scroll
  const prevCatIdsRef = useRef<number[]>(categories.map((c) => c.id));
  const prevParamIdsRef = useRef<number[]>(parameters.map((p) => p.id));

  useEffect(() => {
    const prevIds = prevCatIdsRef.current;
    if (categories.length > prevIds.length) {
      const newCat = categories.find((c) => !prevIds.includes(c.id));
      if (newCat) {
        setExpandedCatIds((prev) => new Set([...prev, newCat.id]));
        setHighlightedIds({ categoryId: newCat.id });
        setTimeout(() => {
          const el = document.getElementById(`category-row-${newCat.id}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 150);
      }
    }
    prevCatIdsRef.current = categories.map((c) => c.id);
  }, [categories]);

  useEffect(() => {
    const prevIds = prevParamIdsRef.current;
    if (parameters.length > prevIds.length) {
      const newParam = parameters.find((p) => !prevIds.includes(p.id));
      if (newParam) {
        if (newParam.categoryId) {
          setExpandedCatIds((prev) => new Set([...prev, newParam.categoryId]));
        }
        setHighlightedIds({ parameterId: newParam.id, categoryId: newParam.categoryId });
        setTimeout(() => {
          const el = document.getElementById(`indicator-row-${newParam.id}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 150);
      }
    }
    prevParamIdsRef.current = parameters.map((p) => p.id);
  }, [parameters]);

  // Close popovers on outside click and handle Escape key
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (guideRef.current && !guideRef.current.contains(e.target as Node)) {
        setIsGuideOpen(false);
      }
      if (
        issuesContainerRef.current &&
        !issuesContainerRef.current.contains(e.target as Node)
      ) {
        setIsIssuesListOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsGuideOpen(false);
        setIsAddingCategory(false);
        setIsIssuesListOpen(false);
      }
    };
    document.addEventListener("click", handleGlobalClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleGlobalClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Explicitly sort categories by sortOrder ASC, id ASC
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
  }, [categories]);

  // Total Category Weight Calculation
  const totalCatWeightPct = useMemo(() => {
    return sortedCategories.reduce((sum, c) => sum + Math.round(Number(c.weight) * 100), 0);
  }, [sortedCategories]);

  const weightDifference = templateTargetPct - totalCatWeightPct;

  // Group parameters by category
  const categoryParametersMap = useMemo(() => {
    const map = new Map<number, KpiParameter[]>();
    for (const cat of sortedCategories) {
      const catParams = parameters
        .filter((p) => p.categoryId === cat.id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
      map.set(cat.id, catParams);
    }
    return map;
  }, [sortedCategories, parameters]);

  // VALIDATION ISSUES LIST (Banner Ringkasan Validasi)
  const validationIssues = useMemo(() => {
    const issues: ValidationIssue[] = [];

    // 1. Total Bobot Parameter vs Target (Draft < target = INFO, > target = WARNING)
    if (totalCatWeightPct < templateTargetPct) {
      // Kondisi template Draft yang belum mencapai target bobot 115% jangan dianggap sebagai error/warning
      // Tampilkan sebagai Info: "Bobot belum lengkap" dan tetap izinkan user melanjutkan konfigurasi
      issues.push({
        id: "total-param-weight",
        severity: "INFO",
        type: "PARAMETER_WEIGHT",
        title: `Bobot belum lengkap (${totalCatWeightPct}% dari ${templateTargetPct}%)`,
        description: `Total bobot parameter saat ini ${totalCatWeightPct}%. Anda dapat terus menambah atau mengatur parameter hingga mencapai target ${templateTargetPct}%. Template Draft tetap dapat diedit dengan bebas.`,
        categoryId: 0, // Tidak mengikat kategori mana pun agar tidak memunculkan icon issue pada baris kategori
      });
    } else if (totalCatWeightPct > templateTargetPct) {
      issues.push({
        id: "total-param-weight",
        severity: "WARNING",
        type: "PARAMETER_WEIGHT",
        title: `Total Bobot Melebihi Target (${totalCatWeightPct}% dari ${templateTargetPct}%)`,
        description: `Total bobot seluruh parameter kelebihan ${totalCatWeightPct - templateTargetPct}% dari target ${templateTargetPct}%. Sesuaikan bobot parameter sebelum publish.`,
        categoryId: 0,
      });
    }

    // 2. Per-Category & Per-Indicator Validation
    for (const cat of sortedCategories) {
      const inds = categoryParametersMap.get(cat.id) || [];
      const isDirect = cat.categoryType === "DIRECT";

      if (isDirect) {
        const directParam = inds[0];
        const scoringMethod = directParam?.scoringMethod || "CRITERIA_BASED";

        if (scoringMethod === "FORMULA_BASED") {
          const ruleId = directParam?.calculationRuleId;
          if (!ruleId) {
            issues.push({
              id: `no-formula-cat-${cat.id}`,
              severity: "ERROR",
              type: "FORMULA_MISSING",
              title: `Formula Belum Ditentukan pada "${cat.name}"`,
              description: "Parameter berbasis formula wajib memiliki aturan perhitungan agar dapat dihitung oleh Calculation Engine.",
              categoryId: cat.id,
              indicatorId: directParam?.id,
            });
          }
        } else if (scoringMethod === "CRITERIA_BASED" || scoringMethod === "RATING_BASED") {
          const directBands = directParam
            ? bands.filter((b) => b.parameterId === directParam.id)
            : [];
          if (directBands.length === 0) {
            issues.push({
              id: `no-bands-param-${cat.id}`,
              severity: "WARNING",
              type: "NO_BANDS",
              title: `Parameter "${cat.name}" Belum Ada Kriteria Scoring`,
              description: "Parameter langsung ini belum memiliki kriteria scoring terstruktur.",
              categoryId: cat.id,
              indicatorId: directParam?.id,
            });
          } else {
            const isQual = directParam?.inputType === "QUALITATIVE";
            const criteriaItems: CriteriaItem[] = directBands.map((b) => ({
              id: b.id,
              label: b.label || undefined,
              operator: (b.operator as any) || (isQual ? "TEXT" : "GTE"),
              minValue: b.minValue !== null ? String(b.minValue) : "",
              maxValue: b.maxValue !== null ? String(b.maxValue) : "",
              score: b.score !== null ? String(b.score) : "0",
            }));
            const valResult = validateStructuredCriteria(
              criteriaItems,
              directParam?.direction || "HIGHER_IS_BETTER",
              directParam?.unit || "%",
              directParam?.measurementType || (isQual ? "TEXT" : undefined)
            );
            if (valResult.hasErrors) {
              issues.push({
                id: `error-criteria-param-${cat.id}`,
                severity: "ERROR",
                type: "BAND_GAP_OVERLAP",
                title: `Overlap / Kriteria Tidak Valid pada "${cat.name}"`,
                description: valResult.errors[0] || "Terdapat rentang kriteria tumpang tindih sehingga tidak dapat dihitung oleh Calculation Engine.",
                categoryId: cat.id,
                indicatorId: directParam?.id,
              });
            } else if (valResult.hasWarnings) {
              issues.push({
                id: `warning-gap-param-${cat.id}`,
                severity: "WARNING",
                type: "BAND_GAP_OVERLAP",
                title: `Celah (Gap) Kriteria pada "${cat.name}"`,
                description: valResult.warnings[0] || "Terdapat celah nilai pada rentang kriteria penilaian.",
                categoryId: cat.id,
                indicatorId: directParam?.id,
              });
            }
          }
        }
      } else {
        // Mode SUB_ITEMS: validasi bobot indikator dilakukan terhadap total 100% di dalam masing-masing parameter
        if (inds.length === 0) {
          issues.push({
            id: `no-inds-param-${cat.id}`,
            severity: "INFO",
            type: "NO_INDICATORS",
            title: `Parameter "${cat.name}" Belum Ada Indikator`,
            description: "Tambahkan indikator pada parameter ini untuk mendistribusikan bobot dan kriteria penilaian.",
            categoryId: cat.id,
          });
        } else {
          const sumIndWeights = inds.reduce(
            (s, ind) => s + Math.round(Number(ind.weight) * 100),
            0
          );
          if (sumIndWeights !== 100) {
            issues.push({
              id: `weight-mismatch-cat-${cat.id}`,
              severity: "WARNING",
              type: "INDICATOR_WEIGHT",
              title: `Distribusi Bobot Indikator "${cat.name}" = ${sumIndWeights}% (Target 100%)`,
              description: `Total bobot indikator di dalam parameter ini harus tepat 100% (${
                sumIndWeights < 100
                  ? `kurang ${100 - sumIndWeights}%`
                  : `kelebihan ${sumIndWeights - 100}%`
              }).`,
              categoryId: cat.id,
            });
          }

          // Check each indicator for formula / scoring bands
          for (const ind of inds) {
            const scoringMethod = ind.scoringMethod || "CRITERIA_BASED";
            if (scoringMethod === "FORMULA_BASED") {
              if (!ind.calculationRuleId) {
                issues.push({
                  id: `no-formula-ind-${ind.id}`,
                  severity: "ERROR",
                  type: "FORMULA_MISSING",
                  title: `Formula Belum Ditentukan pada "${ind.name}"`,
                  description: "Indikator berbasis formula wajib memiliki aturan formula perhitungan agar dapat dihitung oleh Calculation Engine.",
                  categoryId: cat.id,
                  indicatorId: ind.id,
                });
              }
            } else if (scoringMethod === "CRITERIA_BASED" || scoringMethod === "RATING_BASED") {
              const indBands = bands.filter((b) => b.parameterId === ind.id);
              if (indBands.length === 0) {
                issues.push({
                  id: `no-bands-ind-${ind.id}`,
                  severity: "WARNING",
                  type: "NO_BANDS",
                  title: `Indikator "${ind.name}" Belum Ada Kriteria Scoring`,
                  description: "Indikator ini belum memiliki kriteria skala nilai penilaian.",
                  categoryId: cat.id,
                  indicatorId: ind.id,
                });
              } else {
                const isQual = ind.inputType === "QUALITATIVE";
                const criteriaItems: CriteriaItem[] = indBands.map((b) => ({
                  id: b.id,
                  label: b.label || undefined,
                  operator: (b.operator as any) || (isQual ? "TEXT" : "GTE"),
                  minValue: b.minValue !== null ? String(b.minValue) : "",
                  maxValue: b.maxValue !== null ? String(b.maxValue) : "",
                  score: b.score !== null ? String(b.score) : "0",
                }));
                const valResult = validateStructuredCriteria(
                  criteriaItems,
                  ind.direction || "HIGHER_IS_BETTER",
                  ind.unit || "%",
                  ind.measurementType || (isQual ? "TEXT" : undefined)
                );
                if (valResult.hasErrors) {
                  issues.push({
                    id: `error-criteria-ind-${ind.id}`,
                    severity: "ERROR",
                    type: "BAND_GAP_OVERLAP",
                    title: `Overlap / Kriteria Tidak Valid pada "${ind.name}"`,
                    description: valResult.errors[0] || "Terdapat rentang kriteria tumpang tindih sehingga tidak dapat dihitung oleh Calculation Engine.",
                    categoryId: cat.id,
                    indicatorId: ind.id,
                  });
                } else if (valResult.hasWarnings) {
                  issues.push({
                    id: `warning-gap-ind-${ind.id}`,
                    severity: "WARNING",
                    type: "BAND_GAP_OVERLAP",
                    title: `Celah (Gap) Kriteria pada "${ind.name}"`,
                    description: valResult.warnings[0] || "Terdapat celah nilai pada rentang kriteria penilaian.",
                    categoryId: cat.id,
                    indicatorId: ind.id,
                  });
                }
              }
            }
          }
        }
      }
    }

    return issues;
  }, [sortedCategories, categoryParametersMap, bands, totalCatWeightPct, templateTargetPct]);

  // Deduplicate issues by location and type
  const uniqueIssues = useMemo(() => {
    const seen = new Set<string>();
    return validationIssues.filter((issue) => {
      const key = `${issue.type}_${issue.categoryId}_${issue.indicatorId ?? 0}_${issue.bandId ?? 0}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [validationIssues]);

  // Separate issues by severity
  const errorIssues = useMemo(
    () => uniqueIssues.filter((i) => i.severity === "ERROR"),
    [uniqueIssues]
  );
  const warningIssues = useMemo(
    () => uniqueIssues.filter((i) => i.severity === "WARNING"),
    [uniqueIssues]
  );
  const infoIssues = useMemo(
    () => uniqueIssues.filter((i) => i.severity === "INFO"),
    [uniqueIssues]
  );

  // Group issues into clear severity categories for the dropdown panel
  const groupedIssues = useMemo(() => {
    const groups: {
      groupTitle: string;
      severity: IssueSeverity;
      items: ValidationIssue[];
    }[] = [];

    if (errorIssues.length > 0) {
      groups.push({
        groupTitle: "Kendala Kritis (Wajib Diperbaiki)",
        severity: "ERROR",
        items: errorIssues,
      });
    }
    if (warningIssues.length > 0) {
      groups.push({
        groupTitle: "Peringatan Konfigurasi (Perlu Dicek)",
        severity: "WARNING",
        items: warningIssues,
      });
    }
    if (infoIssues.length > 0) {
      groups.push({
        groupTitle: "Informasi (Dalam Proses)",
        severity: "INFO",
        items: infoIssues,
      });
    }

    return groups;
  }, [errorIssues, warningIssues, infoIssues]);

  // Map category ID to severity & message for spreadsheet indicator (highest severity wins)
  const categoryIssuesMap = useMemo(() => {
    const map = new Map<number, { severity: IssueSeverity; message: string }>();
    const severityRank: Record<IssueSeverity, number> = {
      INFO: 1,
      WARNING: 2,
      ERROR: 3,
    };

    for (const issue of uniqueIssues) {
      if (issue.categoryId && issue.categoryId > 0) {
        const existing = map.get(issue.categoryId);
        if (!existing || severityRank[issue.severity] > severityRank[existing.severity]) {
          map.set(issue.categoryId, {
            severity: issue.severity,
            message: issue.description || issue.title,
          });
        }
      }
    }
    return map;
  }, [uniqueIssues]);

  // Initial load in Edit mode: auto-expand only categories with WARNING or ERROR issues
  const hasInitIssuesAccordionRef = useRef(false);
  useEffect(() => {
    if (!hasInitIssuesAccordionRef.current && categories.length > 0) {
      const initialSet = new Set<number>();
      for (const cat of categories) {
        const issue = categoryIssuesMap.get(cat.id);
        if (issue && (issue.severity === "WARNING" || issue.severity === "ERROR")) {
          initialSet.add(cat.id);
        }
      }
      // If no warning or error, expand all categories by default so draft is clearly visible
      if (initialSet.size === 0) {
        for (const cat of categories) {
          initialSet.add(cat.id);
        }
      }
      setExpandedCatIds(initialSet);
      hasInitIssuesAccordionRef.current = true;
    }
  }, [categories, categoryIssuesMap]);

  // Jump to issue with smooth scroll and temporary highlight
  const handleJumpToIssue = (issue: ValidationIssue) => {
    if (!issue.categoryId || issue.categoryId <= 0) return;

    // Auto-close on small screens (<768px), keep open on larger screens
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsIssuesListOpen(false);
    }

    // Auto-open target category if closed so content is rendered
    if (issue.categoryId) {
      setExpandedCatIds((prev) => new Set([...prev, issue.categoryId]));
    }

    setHighlightedIds({
      categoryId: issue.categoryId,
      parameterId: issue.indicatorId,
      bandId: issue.bandId,
    });

    setTimeout(() => {
      const elId = issue.indicatorId
        ? `indicator-row-${issue.indicatorId}`
        : issue.bandId
        ? `band-row-${issue.bandId}`
        : `category-row-${issue.categoryId}`;
      const element = document.getElementById(elId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 150);

    // Auto-clear highlight after 2.5 seconds
    setTimeout(() => {
      setHighlightedIds((prev) => {
        if (
          prev.categoryId === issue.categoryId &&
          prev.parameterId === issue.indicatorId &&
          prev.bandId === issue.bandId
        ) {
          return {};
        }
        return prev;
      });
    }, 2500);
  };

  // CATEGORY ACTIONS
  const handleStartAddCategory = () => {
    setCatNameInput("");
    setCatWeightInput(weightDifference > 0 ? String(weightDifference) : "20");
    setCatModeInput("SUB_ITEMS");

    // Inisialisasi konfigurasi parameter langsung
    const defaultMt = configMeasurementTypes[0]?.code || "PERCENTAGE";
    const defaultUnit =
      configMeasurementTypes.find((m) => m.code === defaultMt)?.defaultUnit || "%";
    setCatMeasurementType(defaultMt);
    setCatUnit(defaultUnit);
    setCatDirection(configDirections[0]?.code || "HIGHER_IS_BETTER");
    setCatTarget("100");
    setCatScoringMethod(configScoringMethods[0]?.code || "CRITERIA_BASED");
    setCatFormulaId(
      calculationRules && calculationRules.length > 0 ? calculationRules[0].id : null
    );
    setCatBands([
      { id: "b-1", operator: "GTE", minValue: "100", maxValue: "", score: "25" },
      { id: "b-2", operator: "BETWEEN", minValue: "95", maxValue: "99", score: "15" },
      { id: "b-3", operator: "LT", minValue: "", maxValue: "95", score: "5" },
    ]);
    setIsAddingCategory(true);
  };

  const handleSaveNewCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNameInput.trim()) return;
    const w = Number(catWeightInput);
    if (isNaN(w) || w <= 0 || w > 200) {
      void Swal.fire({
        icon: "warning",
        title: "Bobot Parameter Tidak Valid",
        text: "Bobot parameter harus antara 1% - 200%",
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    const nextSortOrder = categories.reduce((max, c) => Math.max(max, c.sortOrder ?? 0), 0) + 1;

    const fd = new FormData();
    fd.append("templateId", String(templateId));
    fd.append("name", catNameInput.trim());
    fd.append("weight", String(w));
    fd.append("categoryType", catModeInput);
    fd.append("sortOrder", String(nextSortOrder));

    if (catModeInput === "DIRECT") {
      fd.append("measurementType", catMeasurementType);
      fd.append("unit", catUnit.trim() || "%");
      fd.append("direction", catDirection);
      fd.append("target", catTarget.trim() || "100");
      fd.append("scoringMethod", catScoringMethod);

      if (catScoringMethod === "FORMULA_BASED" && catFormulaId) {
        fd.append("calculationRuleId", String(catFormulaId));
      }

      if (catScoringMethod === "CRITERIA_BASED" || catScoringMethod === "RATING_BASED") {
        const isText = catMeasurementType === "TEXT";
        const formattedBands = catBands.map((b, idx) => {
          if (isText) {
            const rawVal = b.minValue.trim();
            let label = rawVal;
            if (b.operator === "NEQ") label = `≠ "${rawVal}"`;
            else if (b.operator === "CONTAINS") label = `Contains "${rawVal}"`;
            else label = rawVal || `Kriteria ${idx + 1}`;

            return {
              operator: b.operator,
              minValue: null,
              maxValue: null,
              score: b.score || "0",
              label,
            };
          }

          let label = "";
          const unitStr = catUnit ? ` ${catUnit}` : "";
          if (b.operator === "BETWEEN") {
            label = `${b.minValue || "0"}${unitStr} s/d ${b.maxValue || "0"}${unitStr}`;
          } else if (b.operator === "GTE") {
            label = `≥ ${b.minValue || "0"}${unitStr}`;
          } else if (b.operator === "GT") {
            label = `> ${b.minValue || "0"}${unitStr}`;
          } else if (b.operator === "LTE") {
            label = `≤ ${b.maxValue || b.minValue || "0"}${unitStr}`;
          } else if (b.operator === "LT") {
            label = `< ${b.maxValue || b.minValue || "0"}${unitStr}`;
          } else if (b.operator === "EQ") {
            label = `= ${b.minValue || "0"}${unitStr}`;
          } else {
            label = `Kriteria ${idx + 1}`;
          }

          return {
            operator: b.operator,
            minValue: b.minValue !== "" ? b.minValue : null,
            maxValue: b.maxValue !== "" ? b.maxValue : null,
            score: b.score || "0",
            label,
          };
        });

        fd.append("bands", JSON.stringify(formattedBands));
      }
    }

    await addCategoryAction(fd);
    setIsAddingCategory(false);
  };

  const handleUpdateCategory = async (
    catId: number,
    data: { name?: string; weight?: number }
  ) => {
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return;
    const fd = new FormData();
    fd.append("id", String(catId));
    fd.append("templateId", String(templateId));
    fd.append("name", data.name ?? cat.name);
    fd.append("weight", String(data.weight ?? Math.round(Number(cat.weight) * 100)));
    fd.append("categoryType", cat.categoryType || "SUB_ITEMS");
    await updateCategoryAction(fd);
  };

  const handleDeleteCategory = async (cat: KpiCategory) => {
    const fd = new FormData();
    fd.append("id", String(cat.id));
    fd.append("templateId", String(templateId));
    await deleteCategoryAction(fd);
  };

  // CATEGORY EDIT STATE
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategoryWeight, setEditingCategoryWeight] = useState("");

  const handleStartEditCategory = (cat: KpiCategory) => {
    setEditingCategoryId(cat.id);
    setEditingCategoryName(cat.name);
    setEditingCategoryWeight(String(Math.round(Number(cat.weight) * 100)));
  };

  const handleSaveCategoryEdit = async (catId: number) => {
    if (!editingCategoryName.trim()) return;
    const w = Number(editingCategoryWeight);
    if (isNaN(w) || w <= 0 || w > 100) return;
    await handleUpdateCategory(catId, { name: editingCategoryName.trim(), weight: w });
    setEditingCategoryId(null);
  };

  // INDICATOR ACTIONS
  const handleOpenAddIndicator = (catId: number) => {
    setIndicatorModalState({
      isOpen: true,
      categoryId: catId,
      editingIndicator: null,
      initialTab: "info",
    });
  };

  const handleOpenEditIndicator = (
    catId: number,
    indicator: KpiParameter,
    initialTab: "info" | "scoring" = "info"
  ) => {
    setIndicatorModalState({
      isOpen: true,
      categoryId: catId,
      editingIndicator: indicator,
      initialTab,
    });
  };

  const handleDeleteIndicator = async (ind: KpiParameter) => {
    const fd = new FormData();
    fd.append("id", String(ind.id));
    fd.append("templateId", String(templateId));
    await deleteParameterAction(fd);
  };

  const handleDuplicateIndicator = async (paramId: number) => {
    const param = parameters.find((p) => p.id === paramId);
    if (!param) return;
    const catParams = parameters.filter((p) => p.categoryId === param.categoryId);
    const nextOrder = catParams.reduce((max, p) => Math.max(max, p.sortOrder ?? 0), 0) + 1;

    const fd = new FormData();
    fd.append("templateId", String(templateId));
    fd.append("categoryId", String(param.categoryId));
    fd.append("name", `${param.name} (Copy)`);
    fd.append("description", param.description || "");
    fd.append("weight", String(Math.round(Number(param.weight) * 100)));
    fd.append("unit", param.unit || "%");
    fd.append("picRole", param.picRole || "HEAD_DEPT");
    fd.append("target", param.target ? String(Number(param.target)) : "100");
    fd.append("sortOrder", String(nextOrder));
    await addParameterAction(fd);
  };

  const handleMoveParameterOrder = async (param: KpiParameter, direction: "UP" | "DOWN") => {
    const catParams = parameters
      .filter((p) => p.categoryId === param.categoryId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
    const idx = catParams.findIndex((p) => p.id === param.id);
    if (idx === -1) return;
    const targetIdx = direction === "UP" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= catParams.length) return;
    const targetParam = catParams[targetIdx];

    const fd1 = new FormData();
    fd1.append("id", String(param.id));
    fd1.append("templateId", String(templateId));
    fd1.append("categoryId", String(param.categoryId));
    fd1.append("name", param.name);
    fd1.append("description", param.description || "");
    fd1.append("weight", String(Math.round(Number(param.weight) * 100)));
    fd1.append("unit", param.unit || "%");
    fd1.append("picRole", param.picRole || "HEAD_DEPT");
    fd1.append("target", param.target ? String(Number(param.target)) : "100");
    fd1.append("sortOrder", String(targetParam.sortOrder ?? targetIdx));
    await updateParameterAction(fd1);
  };

  const handleUpdateIndicatorName = async (ind: KpiParameter, newName: string) => {
    if (!newName.trim()) return;
    const fd = new FormData();
    fd.append("id", String(ind.id));
    fd.append("templateId", String(templateId));
    fd.append("categoryId", String(ind.categoryId));
    fd.append("name", newName.trim());
    fd.append("description", ind.description || "");
    fd.append("weight", String(Math.round(Number(ind.weight) * 100)));
    fd.append("unit", ind.unit || "%");
    fd.append("picRole", ind.picRole || "HEAD_DEPT");
    fd.append("target", ind.target ? String(Number(ind.target)) : "100");
    await updateParameterAction(fd);
  };

  const handleUpdateIndicatorWeight = async (ind: KpiParameter, newWeight: number) => {
    if (isNaN(newWeight) || newWeight <= 0 || newWeight > 100) return;
    const fd = new FormData();
    fd.append("id", String(ind.id));
    fd.append("templateId", String(templateId));
    fd.append("categoryId", String(ind.categoryId));
    fd.append("name", ind.name);
    fd.append("description", ind.description || "");
    fd.append("weight", String(newWeight));
    fd.append("unit", ind.unit || "%");
    fd.append("picRole", ind.picRole || "HEAD_DEPT");
    fd.append("target", ind.target ? String(Number(ind.target)) : "100");
    await updateParameterAction(fd);
  };

  // BAND ACTIONS
  const handleAddCriteriaBand = (paramId: number) => {
    const param = parameters.find((p) => p.id === paramId);
    if (!param) return;
    setIndicatorModalState({
      isOpen: true,
      categoryId: param.categoryId,
      editingIndicator: param,
      initialTab: "scoring",
    });
  };

  const handleEditCriteriaBand = (band: KpiBand, param: KpiParameter) => {
    setIndicatorModalState({
      isOpen: true,
      categoryId: param.categoryId,
      editingIndicator: param,
      initialTab: "scoring",
    });
  };

  const handleUpdateCriteriaBandInline = async (
    band: KpiBand,
    data: { label?: string; score?: string }
  ) => {
    if (!updateBandAction) return;
    const fd = new FormData();
    fd.append("id", String(band.id));
    fd.append("templateId", String(templateId));
    fd.append("parameterId", String(band.parameterId));
    fd.append("label", data.label !== undefined ? data.label : band.label || "");
    fd.append("operator", band.operator || "TEXT");
    if (band.minValue !== null) fd.append("minValue", String(band.minValue));
    if (band.maxValue !== null) fd.append("maxValue", String(band.maxValue));
    fd.append("score", data.score !== undefined ? String(data.score) : String(band.score || "0"));
    fd.append("sortOrder", String(band.sortOrder ?? 0));
    await updateBandAction(fd);
  };

  const handleDeleteCriteriaBand = async (bandId: number) => {
    const fd = new FormData();
    fd.append("id", String(bandId));
    fd.append("templateId", String(templateId));
    await deleteBandAction(fd);
  };

  const handleMoveBandOrder = async (band: KpiBand, direction: "UP" | "DOWN") => {
    if (!updateBandAction) return;
    const currentSort = band.sortOrder ?? 0;
    const newSort = direction === "UP" ? Math.max(0, currentSort - 1) : currentSort + 1;

    const fd = new FormData();
    fd.append("id", String(band.id));
    fd.append("templateId", String(templateId));
    fd.append("parameterId", String(band.parameterId));
    fd.append("label", band.label || "");
    fd.append("operator", band.operator || "GTE");
    if (band.minValue !== null) fd.append("minValue", String(band.minValue));
    if (band.maxValue !== null) fd.append("maxValue", String(band.maxValue));
    fd.append("score", String(band.score || "0"));
    fd.append("sortOrder", String(newSort));

    await updateBandAction(fd);
  };

  const handleSaveIndicatorFromModal = async (data: {
    name: string;
    description: string;
    weight: string;
    unit: string;
    target: string;
    picRole?: string;
    measurementType?: string;
    direction?: string;
    scoringMethod?: string;
    calculationRuleId?: number | null;
    bands: Array<{
      label: string;
      operator: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT" | "NEQ" | "CONTAINS";
      minValue: string | null;
      maxValue: string | null;
      score: string;
    }>;
  }) => {
    const { categoryId, editingIndicator } = indicatorModalState;
    const fd = new FormData();
    fd.append("templateId", String(templateId));
    fd.append("categoryId", String(categoryId));
    fd.append("name", data.name);
    fd.append("description", data.description);
    fd.append("weight", data.weight);
    fd.append("unit", data.unit);
    fd.append("picRole", data.picRole || "HEAD_DEPT");
    fd.append("target", data.target);
    if (data.measurementType) fd.append("measurementType", data.measurementType);
    if (data.direction) fd.append("direction", data.direction);
    if (data.scoringMethod) fd.append("scoringMethod", data.scoringMethod);
    if (data.calculationRuleId !== undefined) {
      fd.append("calculationRuleId", data.calculationRuleId ? String(data.calculationRuleId) : "");
    }
    fd.append("bands", JSON.stringify(data.bands));

    if (editingIndicator) {
      fd.append("id", String(editingIndicator.id));
      await updateParameterAction(fd);
    } else {
      const catParams = categoryParametersMap.get(categoryId) || [];
      const nextSortOrder = catParams.reduce((max, p) => Math.max(max, p.sortOrder ?? 0), 0) + 1;
      fd.append("sortOrder", String(nextSortOrder));
      await addParameterAction(fd);
    }
  };

  const [isIssuesListOpen, setIsIssuesListOpen] = useState(false);

  return (
    <div className="space-y-2.5 w-full text-slate-800">
      {/* ========================================================= */}
      {/* 1. STRIP VALIDASI TIPIS (±36-40px) + TAMBAH KATEGORI & ⓘ */}
      {/* ========================================================= */}
      <div
        ref={issuesContainerRef}
        className="relative z-20 pb-0.5 transition-all duration-200"
      >
        <div className="relative">
          <div
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all shadow-xs ${
              errorIssues.length > 0
                ? "bg-rose-50/30 border-rose-200/90 text-slate-800"
                : warningIssues.length > 0
                ? "bg-amber-50/30 border-amber-200/90 text-slate-800"
                : "bg-white border-slate-200/80 text-slate-800"
            }`}
          >
            {/* Sisi Kiri: Status Validasi Berdasarkan Severity */}
            {uniqueIssues.length === 0 ? (
              <div className="flex items-center gap-2 font-normal min-w-0 truncate">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="truncate text-slate-700 text-[12.5px]">
                  Struktur valid <span className="text-slate-400">&bull;</span> Total{" "}
                  <span className="font-semibold text-slate-900">{totalCatWeightPct}%</span> / Target{" "}
                  <span className="font-semibold text-slate-900">{templateTargetPct}%</span>
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsIssuesListOpen((prev) => !prev)}
                className="flex items-center gap-2 font-normal min-w-0 truncate text-left cursor-pointer hover:opacity-85 group select-none"
                title="Klik untuk membuka/menutup status validasi struktur KPI"
              >
                {/* Visual Indicator: Error = Merah, Warning = Kuning, Info = Netral (Bukan segitiga warning!) */}
                {errorIssues.length > 0 ? (
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                ) : warningIssues.length > 0 ? (
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                ) : (
                  <Info className="w-4 h-4 text-blue-500 shrink-0" />
                )}

                <span className="truncate text-[12.5px] text-slate-800">
                  {errorIssues.length > 0 ? (
                    <>
                      <span className="font-semibold text-rose-700">{errorIssues.length} kendala kritis</span>
                      {warningIssues.length > 0 && (
                        <span className="text-slate-500 font-normal">, {warningIssues.length} peringatan</span>
                      )}
                    </>
                  ) : warningIssues.length > 0 ? (
                    <span className="font-medium text-amber-800">{warningIssues.length} perhatian validasi</span>
                  ) : (
                    <span className="font-medium text-slate-700">
                      Bobot belum lengkap ({totalCatWeightPct}% dari {templateTargetPct}%)
                    </span>
                  )}
                  <span className="text-slate-400"> &bull; </span>
                  <span className="text-slate-500">Total </span>
                  <span className="font-semibold text-slate-900">{totalCatWeightPct}%</span>
                  <span className="text-slate-400"> / Target </span>
                  <span className="font-semibold text-slate-900">{templateTargetPct}%</span>
                </span>

                <span className="inline-flex items-center gap-0.5 text-xs text-slate-500 group-hover:text-slate-800 shrink-0 ml-1.5 transition-colors">
                  <span>{isIssuesListOpen ? "Tutup" : "Detail"}</span>
                  {isIssuesListOpen ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </span>
              </button>
            )}

            {/* Sisi Kanan: Ikon Info (ⓘ) & Tombol + Tambah Kategori */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Popover Petunjuk Tabel */}
              <div className="relative inline-block" ref={guideRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsGuideOpen((prev) => !prev);
                  }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 shadow-2xs transition cursor-pointer"
                  title="Petunjuk Struktur KPI"
                  aria-label="Petunjuk Struktur KPI"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>

                {isGuideOpen && (
                  <div className="absolute right-0 top-full mt-1.5 z-50 w-72 rounded-xl bg-slate-900 text-white p-3.5 shadow-xl border border-slate-700 text-xs animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2.5">
                      <span className="font-bold text-[11px] uppercase tracking-wider text-slate-300">
                        Struktur Template KPI
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsGuideOpen(false)}
                        className="text-slate-400 hover:text-white text-xs p-0.5 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="space-y-2 text-[11px] text-slate-300 leading-snug">
                      <div>
                        <strong className="text-white block font-semibold">Hierarki: Parameter → Indikator → Kriteria</strong>
                        <span>Total bobot seluruh Parameter harus mencapai target ({templateTargetPct}%). Bobot Indikator di dalam Parameter dinormalisasi ke 100%.</span>
                      </div>
                      <div className="pt-1 border-t border-slate-800">
                        <strong className="text-white block font-semibold">Mode Parameter</strong>
                        <span><b>Langsung (DIRECT)</b>: Parameter tidak punya Indikator, langsung memiliki Kriteria Scoring sendiri. <b>Sub-item (SUB_ITEMS)</b>: Parameter memiliki beberapa Indikator, masing-masing dengan Kriteria Scoring.</span>
                      </div>
                      <div className="pt-1 border-t border-slate-800">
                        <strong className="text-white block font-semibold">Kriteria Scoring Terstruktur</strong>
                        <span>Setiap kriteria harus berbasis angka dan kondisi (≥, ≤, &lt;, &gt;, Rentang) agar kalkulasi otomatis bisa berjalan.</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Tombol Buka Kamus */}
              <button
                type="button"
                onClick={() => setIsPickerOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition cursor-pointer"
                title="Cari & pilih indikator dari Kamus Master Parameter"
              >
                <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                <span>Kamus Parameter</span>
                {deptMasterParams.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                    {deptMasterParams.length}
                  </span>
                )}
              </button>

              {/* Tombol Tambah Kategori */}
              <button
                type="button"
                onClick={handleStartAddCategory}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition cursor-pointer"
                title="Tambah Kategori / Parameter Baru"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Kategori</span>
              </button>
            </div>
          </div>

          {/* INLINE EXPAND PANEL DAFTAR STATUS VALIDASI */}
          {isIssuesListOpen && uniqueIssues.length > 0 && (
            <div className="mt-1.5 rounded-xl bg-white p-4 shadow-md text-slate-800 animate-in fade-in zoom-in-[0.99] duration-150 border-0 ring-1 ring-slate-200">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 text-xs">
                <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                  {errorIssues.length > 0 ? (
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  ) : warningIssues.length > 0 ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    <Info className="w-4 h-4 text-blue-500 shrink-0" />
                  )}
                  <span className="text-[13px] font-semibold text-slate-800">
                    Status Validasi Struktur KPI ({uniqueIssues.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsIssuesListOpen(false)}
                  className="text-xs text-slate-400 hover:text-slate-700 hover:underline cursor-pointer"
                >
                  Tutup (Esc)
                </button>
              </div>

              <div className="max-h-[280px] overflow-y-auto space-y-3 pr-1 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
                {groupedIssues.map((group) => (
                  <div key={group.groupTitle} className="space-y-1">
                    <div className="flex items-center gap-2 px-2 py-0.5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          group.severity === "ERROR"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : group.severity === "WARNING"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {group.severity}
                      </span>
                      <span className="text-xs font-semibold text-slate-600">{group.groupTitle}</span>
                    </div>
                    <div className="space-y-0.5">
                      {group.items.map((issue) => (
                        <div
                          key={issue.id}
                          onClick={() => handleJumpToIssue(issue)}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group select-none"
                        >
                          <div className="min-w-0 flex-1 flex items-start gap-2.5">
                            <div className="mt-0.5 shrink-0">
                              {issue.severity === "ERROR" ? (
                                <AlertCircle className="w-4 h-4 text-rose-500" />
                              ) : issue.severity === "WARNING" ? (
                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                              ) : (
                                <Info className="w-4 h-4 text-blue-500" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs sm:text-[13px] font-medium text-slate-800 group-hover:text-slate-900 truncate">
                                {issue.title}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                                {issue.description}
                              </div>
                            </div>
                          </div>
                          {issue.categoryId > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleJumpToIssue(issue);
                              }}
                              aria-label={`Lihat masalah ${issue.title}`}
                              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                            >
                              <span>Lihat</span>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:translate-x-0.5 transition-transform" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FORM INLINE TAMBAH KATEGORI */}
      {isAddingCategory && (
        <form
          onSubmit={handleSaveNewCategory}
          className="bg-white rounded-xl border border-blue-200/90 p-3 sm:p-3.5 space-y-2.5 animate-in fade-in duration-150 shadow-2xs w-full min-w-0 overflow-hidden text-slate-800"
        >
          {/* Header Form */}
          <div className="border-b border-slate-100 pb-1.5 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900">Tambah Parameter Baru</span>
            <span className="text-[10px] text-slate-400">Tekan Enter untuk simpan &bull; Esc untuk batal</span>
          </div>

          {/* Baris 1: Nama Kategori (flex-1) + Bobot (%) (w-32) dalam satu baris flex, gap 16px, items-end */}
          <div className="flex flex-row items-end gap-4 w-full min-w-0">
            <div className="flex-1 min-w-0">
              <div className="mb-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  Nama Parameter
                </label>
              </div>
              <input
                ref={nameInputRef}
                type="text"
                required
                value={catNameInput}
                onChange={(e) => setCatNameInput(e.target.value)}
                placeholder="Contoh: Target Kerja, Kehadiran & Disiplin, Keselamatan Kerja"
                className="w-full h-9 px-3 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 transition"
              />
              {/* Opsi Cepat: Pilih dari Kamus Departemen / Umum */}
              {allRelevantMasterParams.length > 0 && (
                <div className="mt-1.5">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleSelectFromKamus(e.target.value);
                      }
                    }}
                    defaultValue=""
                    className="w-full text-xs py-1.5 px-2.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">-- Atau pilih dari Kamus Parameter (Opsional) --</option>
                    {deptMasterParams.length > 0 && (
                      <optgroup label={`Kamus ${department?.name || "Departemen"} (${deptMasterParams.length})`}>
                        {deptMasterParams.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code ? `[${p.code}] ` : ""}{p.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {generalMasterParams.length > 0 && (
                      <optgroup label={`Kamus Umum / Corporate (${generalMasterParams.length})`}>
                        {generalMasterParams.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code ? `[${p.code}] ` : ""}{p.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              )}
            </div>

            <div className="w-32 shrink-0">
              <div className="flex items-center justify-between mb-1 whitespace-nowrap">
                <label className="text-[11px] font-bold text-slate-700">Bobot (%)</label>
                <span
                  className="text-[10px] font-semibold text-blue-600"
                  title={`Sisa bobot menuju target ${templateTargetPct}%`}
                >
                  Sisa: {weightDifference}%
                </span>
              </div>
              <input
                type="number"
                required
                min="1"
                max="100"
                value={catWeightInput}
                onChange={(e) => setCatWeightInput(e.target.value)}
                placeholder="20"
                className="w-full h-9 px-2 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-bold tabular-nums text-center transition"
              />
            </div>
          </div>

          {/* Baris 2: Checkbox Mode Parameter */}
          <div className="pt-0.5">
            <label className="inline-flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={catModeInput === "DIRECT"}
                onChange={(e) => setCatModeInput(e.target.checked ? "DIRECT" : "SUB_ITEMS")}
                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-semibold text-slate-800">
                  Parameter langsung (tanpa Indikator)
                </span>
                <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                  Cocok untuk parameter tunggal seperti Kehadiran, SP, Safety. Jika tidak dicentang, Parameter berisi beberapa Indikator yang masing-masing punya Kriteria Scoring sendiri.
                </p>
              </div>
            </label>
          </div>

          {/* Baris Tambahan: Konfigurasi Parameter Langsung (Jika Dicentang) */}
          {catModeInput === "DIRECT" && (
            <div className="bg-slate-50/80 border border-slate-200/90 rounded-xl p-3 sm:p-3.5 space-y-3 mt-1 text-slate-800 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wide">
                  Konfigurasi Pengukuran & Penilaian Parameter
                </span>
                {isConfigLoading && (
                  <span className="text-[10px] text-blue-600 flex items-center gap-1 font-medium">
                    <Loader2 className="w-3 h-3 animate-spin" /> Memuat Master Konfigurasi...
                  </span>
                )}
                {configError && (
                  <button
                    type="button"
                    onClick={fetchKpiConfig}
                    className="text-[10px] text-rose-600 hover:underline font-semibold cursor-pointer"
                  >
                    Gagal memuat: Coba Lagi
                  </button>
                )}
              </div>

              {/* Grid 5 Field: Measurement Type, Unit, KPI Direction, Target, Scoring Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* 1. Measurement Type */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Measurement Type
                  </label>
                  <select
                    value={catMeasurementType}
                    onChange={(e) => handleMeasurementTypeChange(e.target.value)}
                    disabled={isConfigLoading}
                    className="w-full h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 transition cursor-pointer"
                  >
                    {configMeasurementTypes.map((mt) => (
                      <option key={mt.code} value={mt.code}>
                        {mt.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Unit */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Unit (Satuan)
                  </label>
                  <input
                    type="text"
                    disabled={catMeasurementType === "TEXT"}
                    value={catMeasurementType === "TEXT" ? "Teks" : catUnit}
                    onChange={(e) => setCatUnit(e.target.value)}
                    placeholder={catMeasurementType === "TEXT" ? "Teks" : "Contoh: %, IDR, Hari"}
                    className={`w-full h-9 px-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 transition ${
                      catMeasurementType === "TEXT"
                        ? "bg-slate-100 text-slate-500 cursor-not-allowed select-none"
                        : "bg-white"
                    }`}
                  />
                </div>

                {/* 3. KPI Direction */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    KPI Direction
                  </label>
                  <select
                    value={catMeasurementType === "TEXT" ? "NOT_APPLICABLE" : catDirection}
                    onChange={(e) => setCatDirection(e.target.value)}
                    disabled={catMeasurementType === "TEXT" || isConfigLoading}
                    className={`w-full h-9 px-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 transition ${
                      catMeasurementType === "TEXT"
                        ? "bg-slate-100 text-slate-500 cursor-not-allowed select-none"
                        : "bg-white cursor-pointer"
                    }`}
                  >
                    {catMeasurementType === "TEXT" ? (
                      <option value="NOT_APPLICABLE">Not Applicable (Tidak Berlaku)</option>
                    ) : (
                      configDirections.map((kd) => (
                        <option key={kd.code} value={kd.code}>
                          {kd.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* 4. Target */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Target
                  </label>
                  <input
                    type="text"
                    required
                    value={catTarget}
                    onChange={(e) => setCatTarget(e.target.value)}
                    placeholder={catMeasurementType === "TEXT" ? "Contoh: Memenuhi" : "100"}
                    className="w-full h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-semibold tabular-nums transition"
                  />
                </div>

                {/* 5. Scoring Method */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Scoring Method
                  </label>
                  <select
                    value={catScoringMethod}
                    onChange={(e) => setCatScoringMethod(e.target.value)}
                    disabled={isConfigLoading}
                    className="w-full h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 transition cursor-pointer font-medium"
                  >
                    {configScoringMethods.map((sm) => (
                      <option key={sm.code} value={sm.code}>
                        {sm.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Kondisional: Jika Scoring Method = Criteria Based (atau Rating Based) */}
              {(catScoringMethod === "CRITERIA_BASED" || catScoringMethod === "RATING_BASED") && (
                <div className="pt-2 border-t border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-slate-800">
                        Kriteria Penilaian ({catBands.length} Baris)
                      </span>
                      <p className="text-[10px] text-slate-500">
                        {catMeasurementType === "TEXT"
                          ? "Tentukan operator teks, value text kualitatif, dan skor perolehan."
                          : `Tentukan operator, nilai/rentang pencapaian (${catUnit || "nilai"}), dan skor perolehan.`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCatBand}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Kriteria</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="py-1.5 px-3 w-12 text-center">No</th>
                          <th className="py-1.5 px-3 w-44">Operator</th>
                          <th className="py-1.5 px-3 min-w-[200px]">
                            {catMeasurementType === "TEXT"
                              ? "Value Text"
                              : `Value / Range (${catUnit || "Nilai"})`}
                          </th>
                          <th className="py-1.5 px-3 w-28 text-center">Score</th>
                          <th className="py-1.5 px-3 w-16 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        {catBands.map((band, idx) => (
                          <tr key={band.id} className="hover:bg-slate-50/60 transition">
                            <td className="py-1.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-1.5 px-3">
                              {catMeasurementType === "TEXT" ? (
                                <select
                                  value={band.operator}
                                  onChange={(e) =>
                                    handleUpdateCatBand(
                                      band.id,
                                      "operator",
                                      e.target.value as any
                                    )
                                  }
                                  className="w-full h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 cursor-pointer"
                                >
                                  <option value="EQ">Equals (=)</option>
                                  <option value="NEQ">Not Equals (≠)</option>
                                  <option value="CONTAINS">Contains (Teks)</option>
                                </select>
                              ) : (
                                <select
                                  value={band.operator}
                                  onChange={(e) =>
                                    handleUpdateCatBand(
                                      band.id,
                                      "operator",
                                      e.target.value as any
                                    )
                                  }
                                  className="w-full h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 cursor-pointer"
                                >
                                  <option value="LT">&lt; (Kurang dari)</option>
                                  <option value="LTE">≤ (Kurang dari sama dengan)</option>
                                  <option value="EQ">= (Sama dengan)</option>
                                  <option value="GT">&gt; (Lebih dari)</option>
                                  <option value="GTE">≥ (Lebih dari sama dengan)</option>
                                  <option value="BETWEEN">Range (Rentang Nilai)</option>
                                </select>
                              )}
                            </td>
                            <td className="py-1.5 px-3">
                              {catMeasurementType === "TEXT" ? (
                                <input
                                  type="text"
                                  required
                                  placeholder="Contoh: Memenuhi"
                                  value={band.minValue}
                                  onChange={(e) => {
                                    handleUpdateCatBand(band.id, "minValue", e.target.value);
                                    handleUpdateCatBand(band.id, "maxValue", "");
                                  }}
                                  className="w-full h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 font-medium"
                                />
                              ) : band.operator === "BETWEEN" ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    required
                                    placeholder="Min"
                                    value={band.minValue}
                                    onChange={(e) =>
                                      handleUpdateCatBand(band.id, "minValue", e.target.value)
                                    }
                                    className="w-24 h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 font-medium tabular-nums"
                                  />
                                  <span className="text-[11px] text-slate-400 font-medium">s/d</span>
                                  <input
                                    type="text"
                                    required
                                    placeholder="Max"
                                    value={band.maxValue}
                                    onChange={(e) =>
                                      handleUpdateCatBand(band.id, "maxValue", e.target.value)
                                    }
                                    className="w-24 h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 font-medium tabular-nums"
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    required
                                    placeholder={
                                      band.operator === "LT" || band.operator === "LTE"
                                        ? "Batas Nilai (Max)"
                                        : "Batas Nilai (Min)"
                                    }
                                    value={
                                      band.operator === "LT" || band.operator === "LTE"
                                        ? band.maxValue || band.minValue
                                        : band.minValue || band.maxValue
                                    }
                                    onChange={(e) => {
                                      if (band.operator === "LT" || band.operator === "LTE") {
                                        handleUpdateCatBand(band.id, "maxValue", e.target.value);
                                        handleUpdateCatBand(band.id, "minValue", "");
                                      } else {
                                        handleUpdateCatBand(band.id, "minValue", e.target.value);
                                        handleUpdateCatBand(band.id, "maxValue", "");
                                      }
                                    }}
                                    className="w-40 h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 font-medium tabular-nums"
                                  />
                                </div>
                              )}
                            </td>
                            <td className="py-1.5 px-3 text-center">
                              <input
                                type="text"
                                required
                                placeholder="25"
                                value={band.score}
                                onChange={(e) =>
                                  handleUpdateCatBand(band.id, "score", e.target.value)
                                }
                                className="w-20 h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 font-bold tabular-nums text-center mx-auto"
                              />
                            </td>
                            <td className="py-1.5 px-3 text-center">
                              {catBands.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCatBand(band.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer transition"
                                  title="Hapus baris kriteria"
                                >
                                  <Trash2 className="w-3.5 h-3.5 mx-auto" />
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-300">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Kondisional: Jika Scoring Method = Formula Based */}
              {catScoringMethod === "FORMULA_BASED" && (
                <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-800">
                    Formula Perhitungan Nilai / Skor
                  </label>
                  {calculationRules && calculationRules.length > 0 ? (
                    <div className="space-y-1.5">
                      <select
                        value={catFormulaId ?? ""}
                        onChange={(e) =>
                          setCatFormulaId(e.target.value ? Number(e.target.value) : null)
                        }
                        className="w-full h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
                      >
                        <option value="">Pilih Formula Engine...</option>
                        {calculationRules.map((rule) => (
                          <option key={rule.id} value={rule.id}>
                            {rule.name} ({rule.code}){rule.description ? ` : ${rule.description}` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-500">
                        Formula engine mengevaluasi capaian aktual terhadap target secara otomatis sesuai rumus terdaftar.
                      </p>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700">Rumus Default:</span>
                        <code className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          (Actual / Target) * 100
                        </code>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Hasil kalkulasi akan dikonversi otomatis ke skor capaian.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Kondisional: Jika Scoring Method = Direct Score */}
              {catScoringMethod === "DIRECT_SCORE" && (
                <div className="pt-2 border-t border-slate-200/80">
                  <div className="p-2.5 bg-blue-50/60 border border-blue-100 rounded-lg text-[11px] text-slate-700 flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-800">Metode Penilaian Langsung:</span>
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        Skor parameter ini diisi langsung secara diskresioner oleh Asesor atau Penilai saat tahap appraisal, tanpa kriteria rentang kuantitatif atau formula otomatis.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Baris 3: Footer Aksi */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddingCategory(false)}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs cursor-pointer transition active:scale-98"
            >
              Simpan Parameter
            </button>
          </div>
        </form>
      )}

      {/* ========================================================= */}
      {/* 2. MODERN SPREADSHEET KPI TABLE (Parameter → Indikator → Kriteria) */}
      {/* ========================================================= */}
      <KpiModernSpreadsheet
        categories={categories}
        parameters={parameters}
        bands={bands}
        calculationRules={calculationRules}
        templateTargetPct={templateTargetPct}
        expandedCategoryIds={expandedCatIds}
        onToggleCategory={handleToggleCategory}
        categoryIssuesMap={categoryIssuesMap}
        highlightedIds={highlightedIds}
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
        onUpdateIndicatorWeight={handleUpdateIndicatorWeight}
        onAddIndicator={handleOpenAddIndicator}
        onEditIndicator={handleOpenEditIndicator}
        onDeleteIndicator={handleDeleteIndicator}
        onDuplicateIndicator={handleDuplicateIndicator}
        onMoveIndicatorOrder={handleMoveParameterOrder}
        onAddCriteriaBand={handleAddCriteriaBand}
        onEditCriteriaBand={handleEditCriteriaBand}
        onDeleteCriteriaBand={handleDeleteCriteriaBand}
        onMoveBandOrder={handleMoveBandOrder}
        isEditTemplateMode={isEditTemplateMode}
        onToggleEditTemplateMode={handleToggleEditTemplateMode}
        templateId={templateId}
      />

      {/* ========================================================= */}
      {/* 4. MODAL INDIKATOR & SKALA NILAI (Scoring Table inside Modal) */}
      {/* ========================================================= */}
      <IndicatorModal
        isOpen={indicatorModalState.isOpen}
        onClose={() => setIndicatorModalState((prev) => ({ ...prev, isOpen: false }))}
        parameterId={indicatorModalState.categoryId}
        categoryId={indicatorModalState.categoryId}
        templateId={templateId}
        editingIndicator={indicatorModalState.editingIndicator}
        existingBands={bands}
        calculationRules={calculationRules}
        initialTab={indicatorModalState.initialTab || "info"}
        masterParams={masterParams}
        department={department}
        onSave={handleSaveIndicatorFromModal}
      />

      {/* ========================================================= */}
      {/* 5. MODAL PEMILIH MASTER PARAMETER (KAMUS) */}
      {/* ========================================================= */}
      <MasterParameterPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        departmentId={department?.id}
        departmentName={department?.name}
        masterParameters={masterParams}
        canApplyAll={deptMasterParams.length > 0 && categories.length === 0}
        onApplyAllDept={handleApplyAllDeptParams}
        onSelect={(p) => {
          if (isAddingCategory) {
            handleSelectFromKamus(p.id);
          } else {
            void handleAddSingleParamFromKamus(p);
          }
        }}
      />
    </div>
  );
}
