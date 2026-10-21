import React, { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  Layers,
  Award,
  Loader2,
  Calculator,
  Info,
  Check,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import type {
  KpiParameter,
  KpiBand,
  KpiCalculationRule,
  KpiMeasurementType,
  KpiDirection,
  KpiScoringMethod,
} from "@/db/schema";
import Swal from "sweetalert2";
import { formatNaturalCriteria } from "@/lib/kpi-display";
import {
  generateAutoFillCriteria,
  validateStructuredCriteria,
} from "@/lib/kpi-criteria-helper";

export interface IndicatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  parameterId: number; // The parent parameter ID
  categoryId: number;
  templateId: number;
  editingIndicator?: KpiParameter | null;
  existingBands?: KpiBand[];
  calculationRules?: KpiCalculationRule[];
  initialTab?: "info" | "scoring";
  onSave: (data: {
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
  }) => Promise<void>;
}

export interface CriteriaRow {
  id?: number | string;
  label?: string;
  operator: "GTE" | "LT" | "EQ" | "BETWEEN" | "GT" | "LTE" | "TEXT" | "NEQ" | "CONTAINS";
  minValue: string;
  maxValue: string;
  score: string;
  textEnum?: string;
}

export function formatNaturalCriteriaRow(
  row: {
    operator: string;
    minValue: string;
    maxValue: string;
    score: string;
    label?: string;
  },
  unit: string
): string {
  return formatNaturalCriteria(row, unit).display;
}

export function IndicatorModal({
  isOpen,
  onClose,
  parameterId,
  categoryId,
  templateId,
  editingIndicator,
  existingBands = [],
  calculationRules = [],
  initialTab = "info",
  onSave,
}: IndicatorModalProps) {
  const [activeTab, setActiveTab] = useState<"info" | "scoring">(initialTab);
  const [isSaving, setIsSaving] = useState(false);

  // Master KPI Configuration from API
  const [configMeasurementTypes, setConfigMeasurementTypes] = useState<KpiMeasurementType[]>([]);
  const [configDirections, setConfigDirections] = useState<KpiDirection[]>([]);
  const [configScoringMethods, setConfigScoringMethods] = useState<KpiScoringMethod[]>([]);
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [weight, setWeight] = useState("20");

  // KPI Configuration Fields
  const [measurementType, setMeasurementType] = useState("PERCENTAGE");
  const [unit, setUnit] = useState("%");
  const [direction, setDirection] = useState("HIGHER_IS_BETTER");
  const [scoringMethod, setScoringMethod] = useState("CRITERIA_BASED");
  const [target, setTarget] = useState("100");
  const [calculationRuleId, setCalculationRuleId] = useState<number | null>(null);

  // Table Column Resizing State for Kriteria Scoring Table
  const [colWidths, setColWidths] = useState({
    no: 44,
    operator: 170,
    value: 260,
    score: 85,
    action: 44,
  });

  const minColWidths: Record<string, number> = {
    no: 36,
    operator: 130,
    value: 160,
    score: 65,
    action: 40,
  };

  const totalTableWidth = React.useMemo(() => {
    return Object.values(colWidths).reduce((a, b) => a + b, 0);
  }, [colWidths]);

  const resizingRef = React.useRef<{
    colKey: keyof typeof colWidths;
    startX: number;
    startWidth: number;
  } | null>(null);

  const handleStartResize = (
    e: React.MouseEvent,
    colKey: keyof typeof colWidths
  ) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = {
      colKey,
      startX: e.clientX,
      startWidth: colWidths[colKey],
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const { colKey, startX, startWidth } = resizingRef.current;
      const diff = moveEvent.clientX - startX;
      const min = minColWidths[colKey] || 40;
      const newWidth = Math.max(min, startWidth + diff);
      setColWidths((prev) => ({
        ...prev,
        [colKey]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Tab 2: Kriteria Scoring
  const [criteria, setCriteria] = useState<CriteriaRow[]>([
    { operator: "GTE", minValue: "100", maxValue: "", score: "25" },
    { operator: "BETWEEN", minValue: "95", maxValue: "99", score: "15" },
    { operator: "LT", minValue: "", maxValue: "95", score: "5" },
  ]);
  const [isAutoFillEnabled, setIsAutoFillEnabled] = useState(true);

  // Real-time structured criteria validation (Gap, Overlap, Incomplete)
  // Helper flags
  const isTextType = measurementType === "TEXT";
  const isCurrency =
    !isTextType &&
    (measurementType === "CURRENCY" ||
      unit.toLowerCase() === "idr" ||
      unit.toLowerCase() === "rp" ||
      unit.toLowerCase() === "rupiah");
  const isPercentage = !isTextType && (measurementType === "PERCENTAGE" || unit === "%");

  // Real-time structured criteria validation (Gap, Overlap, Incomplete, Text Validation)
  const criteriaValidation = React.useMemo(() => {
    return validateStructuredCriteria(criteria, direction, unit, measurementType);
  }, [criteria, direction, unit, measurementType]);

  // Fetch KPI Configuration from API
  const fetchKpiConfig = async () => {
    setIsConfigLoading(true);
    setConfigError(null);
    try {
      const res = await fetch("/api/admin/kpi-config");
      const json = await res.json();
      if (json.success && json.config) {
        setConfigMeasurementTypes(json.config.measurementTypes || []);
        setConfigDirections(json.config.directions || []);
        setConfigScoringMethods(json.config.scoringMethods || []);
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
    if (isOpen) {
      void fetchKpiConfig();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || "info");
      if (editingIndicator) {
        setName(editingIndicator.name || "");
        setDescription(editingIndicator.description || "");
        setWeight(String(Math.round(Number(editingIndicator.weight) * 100) || 20));

        const mt =
          editingIndicator.measurementType ||
          (editingIndicator.inputType === "PERCENTAGE"
            ? "PERCENTAGE"
            : editingIndicator.inputType === "CURRENCY"
            ? "CURRENCY"
            : editingIndicator.inputType === "QUALITATIVE"
            ? "TEXT"
            : "NUMBER");
        const isEditingText = mt === "TEXT";
        setMeasurementType(mt);
        setUnit(isEditingText ? "Teks" : editingIndicator.unit || "%");
        setDirection(isEditingText ? "NOT_APPLICABLE" : editingIndicator.direction || "HIGHER_IS_BETTER");
        setScoringMethod(editingIndicator.scoringMethod || "CRITERIA_BASED");

        // Target: jika teks, jangan convert ke Number
        if (isEditingText) {
          setTarget(editingIndicator.target || "Memenuhi");
        } else {
          setTarget(
            editingIndicator.target !== null && editingIndicator.target !== undefined && !isNaN(Number(editingIndicator.target))
              ? String(Number(editingIndicator.target))
              : editingIndicator.target || ""
          );
        }

        setCalculationRuleId(editingIndicator.calculationRuleId ?? null);

        const relevantBands = existingBands
          .filter((b) => b.parameterId === editingIndicator.id)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

        if (relevantBands.length > 0) {
          setCriteria(
            relevantBands.map((b) => {
              let val = "";
              if (b.minValue !== null && b.minValue !== undefined && b.minValue !== "" && !isNaN(Number(b.minValue))) {
                val = String(Number(b.minValue));
              } else if (b.label) {
                // Bersihkan prefix jika ada
                val = b.label
                  .replace(/^[≠=]\s*/, "")
                  .replace(/^Contains\s*["']?([^"']*)["']?$/i, "$1")
                  .trim();
              }
              return {
                id: b.id,
                label: b.label || "",
                operator: (b.operator as any) || (isEditingText ? "EQ" : "GTE"),
                minValue: val,
                maxValue: b.maxValue !== null && !isNaN(Number(b.maxValue)) ? String(Number(b.maxValue)) : "",
                score: b.score ? String(Number(b.score)) : "25",
              };
            })
          );
        } else {
          if (isEditingText) {
            setCriteria([
              { operator: "EQ", minValue: "Memenuhi", maxValue: "", score: "25" },
              { operator: "EQ", minValue: "Sebagian Memenuhi", maxValue: "", score: "15" },
              { operator: "EQ", minValue: "Tidak Memenuhi", maxValue: "", score: "5" },
            ]);
          } else {
            setCriteria([
              { operator: "GTE", minValue: "100", maxValue: "", score: "25" },
              { operator: "BETWEEN", minValue: "95", maxValue: "99", score: "15" },
              { operator: "LT", minValue: "", maxValue: "95", score: "5" },
            ]);
          }
        }
      } else {
        setName("");
        setDescription("");
        setWeight("20");
        const defaultMt = configMeasurementTypes[0]?.code || "PERCENTAGE";
        const isInitText = defaultMt === "TEXT";
        const defaultUnit = isInitText
          ? "Teks"
          : configMeasurementTypes.find((m) => m.code === defaultMt)?.defaultUnit || "%";
        setMeasurementType(defaultMt);
        setUnit(defaultUnit);
        setDirection(isInitText ? "NOT_APPLICABLE" : configDirections[0]?.code || "HIGHER_IS_BETTER");
        setScoringMethod(configScoringMethods[0]?.code || "CRITERIA_BASED");
        setTarget(
          isInitText
            ? "Memenuhi"
            : defaultMt === "PERCENTAGE"
            ? "100"
            : defaultMt === "CURRENCY"
            ? "25000000"
            : defaultMt === "COUNT" || defaultMt === "DAYS"
            ? "0"
            : "100"
        );
        const defaultRule =
          calculationRules.find((r) => r.code === "ACH-NORMAL-V1") ||
          calculationRules.find((r) => r.calculationType === "ACHIEVEMENT");
        setCalculationRuleId(defaultRule ? defaultRule.id : calculationRules[0]?.id || null);
        if (isInitText) {
          setCriteria([
            { operator: "EQ", minValue: "Memenuhi", maxValue: "", score: "25" },
            { operator: "EQ", minValue: "Sebagian Memenuhi", maxValue: "", score: "15" },
            { operator: "EQ", minValue: "Tidak Memenuhi", maxValue: "", score: "5" },
          ]);
        } else {
          setCriteria([
            { operator: "GTE", minValue: "100", maxValue: "", score: "25" },
            { operator: "BETWEEN", minValue: "95", maxValue: "99", score: "15" },
            { operator: "LT", minValue: "", maxValue: "95", score: "5" },
          ]);
        }
      }
    }
  }, [isOpen, editingIndicator, existingBands, calculationRules]);

  if (!isOpen) return null;

  const handleMeasurementTypeChange = (newMt: string) => {
    setMeasurementType(newMt);

    if (newMt === "TEXT") {
      setUnit("Teks");
      setDirection("NOT_APPLICABLE");
      if (!target || target === "100" || target === "0" || target === "25000000") {
        setTarget("Memenuhi");
      }
      // Switch criteria rows to qualitative mapping if currently numeric
      const hasNumericOp = criteria.some((c) =>
        ["GT", "GTE", "LT", "LTE", "BETWEEN"].includes(c.operator)
      );
      if (hasNumericOp || criteria.length === 0) {
        setCriteria([
          { operator: "EQ", minValue: "Memenuhi", maxValue: "", score: "25" },
          { operator: "EQ", minValue: "Sebagian Memenuhi", maxValue: "", score: "15" },
          { operator: "EQ", minValue: "Tidak Memenuhi", maxValue: "", score: "5" },
        ]);
      }
    } else {
      // Reverting from TEXT or switching between numeric types
      const matched = configMeasurementTypes.find((m) => m.code === newMt);
      if (matched && matched.defaultUnit) {
        setUnit(matched.defaultUnit);
      } else {
        setUnit(newMt === "PERCENTAGE" ? "%" : newMt === "CURRENCY" ? "IDR" : "");
      }

      if (direction === "NOT_APPLICABLE") {
        const fallbackDir =
          configDirections.find((d) => d.code !== "NOT_APPLICABLE")?.code || "HIGHER_IS_BETTER";
        setDirection(fallbackDir);
      }

      // Update default target format
      if (newMt === "PERCENTAGE") {
        if (!target || target === "0" || target === "25000000" || target === "Memenuhi") setTarget("100");
      } else if (newMt === "CURRENCY") {
        if (!target || target === "100" || target === "Memenuhi") setTarget("25000000");
      } else if (newMt === "COUNT" || newMt === "DAYS") {
        if (!target || target === "100" || target === "25000000" || target === "Memenuhi") setTarget("0");
      }

      // Revert criteria to numeric standard if switching from TEXT
      const hasTextOp = criteria.some((c) =>
        c.operator === "NEQ" || c.operator === "CONTAINS" || c.operator === "TEXT" || (c.operator === "EQ" && isNaN(Number(c.minValue)))
      );
      if (hasTextOp) {
        setCriteria([
          { operator: "GTE", minValue: "100", maxValue: "", score: "25" },
          { operator: "BETWEEN", minValue: "95", maxValue: "99", score: "15" },
          { operator: "LT", minValue: "", maxValue: "95", score: "5" },
        ]);
      }
    }
  };

  const handleAddCriteriaRow = () => {
    setCriteria((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        operator: isTextType ? "EQ" : "GTE",
        minValue: "",
        maxValue: "",
        score: "10",
      },
    ]);
  };

  const handleRemoveCriteriaRow = (index: number) => {
    if (criteria.length <= 1) {
      void Swal.fire({
        icon: "warning",
        title: "Minimal 1 Kriteria",
        text: "Indikator wajib memiliki setidaknya satu baris kriteria scoring.",
        confirmButtonColor: "#0f172a",
      });
      return;
    }
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTriggerAutoFill = () => {
    if (criteria.length === 0) return;
    const filled = generateAutoFillCriteria({
      firstRow: criteria[0],
      currentRows: criteria,
      direction,
      measurementType,
      unit,
    });
    setCriteria(filled);
  };

  const handleCriteriaChange = (index: number, field: keyof CriteriaRow, value: string) => {
    setCriteria((prev) => {
      const next = [...prev];
      const updatedRow = { ...next[index], [field]: value };
      next[index] = updatedRow;

      // Auto-fill baris berikutnya saat rule/threshold pertama diubah (jika auto-fill aktif)
      if (
        index === 0 &&
        isAutoFillEnabled &&
        (field === "operator" || field === "minValue" || field === "maxValue" || field === "score")
      ) {
        return generateAutoFillCriteria({
          firstRow: updatedRow,
          currentRows: next,
          direction,
          measurementType,
          unit,
        });
      }

      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setActiveTab("info");
      void Swal.fire({
        icon: "warning",
        title: "Nama Indikator Wajib Diisi",
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    const weightNum = Number(weight);
    if (isNaN(weightNum) || weightNum <= 0 || weightNum > 100) {
      setActiveTab("info");
      void Swal.fire({
        icon: "warning",
        title: "Bobot Tidak Valid",
        text: "Bobot indikator harus bernilai antara 1% sampai 100%.",
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    const isCriteriaMode = scoringMethod === "CRITERIA_BASED" || scoringMethod === "RATING_BASED";
    if (isCriteriaMode && criteria.length === 0) {
      setActiveTab("scoring");
      void Swal.fire({
        icon: "warning",
        title: "Kriteria Scoring Kosong",
        text: "Harap tambahkan minimal 1 kriteria scoring untuk metode Criteria Based.",
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    if (isCriteriaMode && criteriaValidation.hasErrors) {
      setActiveTab("scoring");
      void Swal.fire({
        icon: "warning",
        title: "Kriteria Scoring Belum Valid",
        text:
          criteriaValidation.errors[0] ||
          "Terdapat kesalahan atau kriteria scoring belum lengkap.",
        confirmButtonColor: "#0f172a",
      });
      return;
    }

    try {
      setIsSaving(true);
      let bandsPayload: Array<{
        label: string;
        operator: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT" | "NEQ" | "CONTAINS";
        minValue: string | null;
        maxValue: string | null;
        score: string;
      }> = [];

      if (isCriteriaMode) {
        if (isTextType) {
          bandsPayload = criteria.map((c, idx) => {
            const rawVal = c.minValue.trim();
            let label = rawVal;
            if (c.operator === "NEQ") {
              label = `≠ "${rawVal}"`;
            } else if (c.operator === "CONTAINS") {
              label = `Contains "${rawVal}"`;
            } else {
              label = rawVal || `Kriteria ${idx + 1}`;
            }

            return {
              label,
              operator: c.operator as any,
              minValue: null,
              maxValue: null,
              score: c.score || "25",
            };
          });
        } else {
          bandsPayload = criteria.map((c, idx) => {
            let minVal: string | null = null;
            let maxVal: string | null = null;

            if (c.operator === "BETWEEN") {
              minVal = c.minValue.trim() ? c.minValue.trim() : "0";
              maxVal = c.maxValue.trim() ? c.maxValue.trim() : "100";
            } else if (c.operator === "LT" || c.operator === "LTE") {
              minVal = null;
              maxVal = (c.maxValue || c.minValue || "").trim() || null;
            } else if (c.operator === "GT" || c.operator === "GTE") {
              minVal = (c.minValue || c.maxValue || "").trim() || null;
              maxVal = null;
            } else if (c.operator === "EQ") {
              const v = (c.minValue || c.maxValue || "").trim() || null;
              minVal = v;
              maxVal = v;
            } else if (c.operator === "TEXT") {
              minVal = c.minValue.trim() || c.label?.trim() || "Pilihan";
              maxVal = null;
            } else {
              minVal = c.minValue.trim() ? c.minValue.trim() : null;
            }

            const naturalItem = formatNaturalCriteria(
              {
                operator: c.operator,
                minValue: minVal,
                maxValue: maxVal,
                score: c.score,
                label: c.label,
              },
              unit
            );

            return {
              label: naturalItem.condition || `Kriteria ${idx + 1}`,
              operator: c.operator as any,
              minValue: minVal,
              maxValue: maxVal,
              score: c.score || "25",
            };
          });
        }
      }

      await onSave({
        name: name.trim(),
        description: description.trim(),
        weight: String(weightNum),
        unit: isTextType ? "Teks" : unit.trim() || "%",
        target: isTextType ? (target.trim() || "Memenuhi") : (target.trim() || "100"),
        measurementType,
        direction: isTextType ? "NOT_APPLICABLE" : direction,
        scoringMethod,
        calculationRuleId: scoringMethod === "FORMULA_BASED" ? calculationRuleId : calculationRuleId || null,
        bands: bandsPayload,
      });

      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data indikator.";
      void Swal.fire({
        icon: "error",
        title: "Gagal Menyimpan",
        text: msg,
        confirmButtonColor: "#0f172a",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const applyPreset = (
    presetType:
      | "standard3"
      | "standard4"
      | "sp"
      | "safety"
      | "currency"
      | "days"
      | "text3"
      | "text2"
  ) => {
    if (presetType === "text3") {
      setCriteria([
        { operator: "EQ", minValue: "Memenuhi", maxValue: "", score: "25" },
        { operator: "EQ", minValue: "Sebagian Memenuhi", maxValue: "", score: "15" },
        { operator: "EQ", minValue: "Tidak Memenuhi", maxValue: "", score: "5" },
      ]);
    } else if (presetType === "text2") {
      setCriteria([
        { operator: "EQ", minValue: "Ya", maxValue: "", score: "25" },
        { operator: "EQ", minValue: "Tidak", maxValue: "", score: "0" },
      ]);
    } else if (presetType === "standard3") {
      setCriteria([
        { operator: "GTE", minValue: "100", maxValue: "", score: "25" },
        { operator: "BETWEEN", minValue: "95", maxValue: "99", score: "15" },
        { operator: "LT", minValue: "", maxValue: "95", score: "5" },
      ]);
    } else if (presetType === "standard4") {
      setCriteria([
        { operator: "GTE", minValue: "100", maxValue: "", score: "25" },
        { operator: "BETWEEN", minValue: "95", maxValue: "99", score: "20" },
        { operator: "BETWEEN", minValue: "90", maxValue: "94", score: "15" },
        { operator: "LT", minValue: "", maxValue: "90", score: "5" },
      ]);
    } else if (presetType === "sp") {
      setCriteria([
        { operator: "EQ", minValue: "0", maxValue: "", score: "25" },
        { operator: "EQ", minValue: "1", maxValue: "", score: "15" },
        { operator: "EQ", minValue: "2", maxValue: "", score: "10" },
        { operator: "EQ", minValue: "3", maxValue: "", score: "0" },
      ]);
    } else if (presetType === "safety") {
      setCriteria([
        { operator: "EQ", minValue: "0", maxValue: "", score: "25" },
        { operator: "BETWEEN", minValue: "1", maxValue: "2", score: "15" },
        { operator: "GT", minValue: "2", maxValue: "", score: "5" },
      ]);
    } else if (presetType === "currency") {
      setCriteria([
        { operator: "LTE", minValue: "", maxValue: "25000000", score: "25" },
        { operator: "BETWEEN", minValue: "25000001", maxValue: "50000000", score: "15" },
        { operator: "GT", minValue: "50000000", maxValue: "", score: "5" },
      ]);
    } else if (presetType === "days") {
      setCriteria([
        { operator: "LTE", minValue: "", maxValue: "3", score: "25" },
        { operator: "BETWEEN", minValue: "4", maxValue: "7", score: "15" },
        { operator: "GT", minValue: "7", maxValue: "", score: "5" },
      ]);
    }
  };

  const selectedRule = calculationRules.find((r) => r.id === calculationRuleId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {editingIndicator ? "Edit Indikator / Kriteria Scoring" : "Tambah Indikator / Kriteria Scoring"}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola informasi pokok dan kriteria scoring terstruktur untuk kalkulasi otomatis.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2 Tabs Header */}
        <div className="flex border-b border-slate-200 bg-white px-6">
          <button
            type="button"
            onClick={() => setActiveTab("info")}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === "info"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>1. Informasi Pokok</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("scoring")}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === "scoring"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {scoringMethod === "FORMULA_BASED" ? (
              <Calculator className="w-3.5 h-3.5" />
            ) : (
              <Award className="w-3.5 h-3.5" />
            )}
            <span>
              {scoringMethod === "FORMULA_BASED"
                ? "2. Formula Engine"
                : scoringMethod === "DIRECT_SCORE"
                ? "2. Penilaian Langsung"
                : "2. Kriteria Scoring Terstruktur"}
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === "info" ? (
            /* TAB 1: INFORMASI POKOK */
            <div className="space-y-4">
              {/* Header Status KPI Config */}
              {isConfigLoading && (
                <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg flex items-center gap-2 text-xs text-blue-700">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Memuat master KPI Configuration dari sistem...</span>
                </div>
              )}
              {configError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-xs text-rose-700">
                  <span>{configError}</span>
                  <button
                    type="button"
                    onClick={fetchKpiConfig}
                    className="underline font-bold cursor-pointer"
                  >
                    Coba Lagi
                  </button>
                </div>
              )}

              {/* 1. Nama Indikator */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Indikator <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Pencapaian Produksi, Ketepatan Waktu Laporan, dll"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>

              {/* 2. Bobot & Measurement Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Bobot Indikator (%) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="1"
                      max="100"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="20"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition pr-8 font-bold tabular-nums"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Bobot distribusi internal di dalam parameter.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Measurement Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={measurementType}
                    onChange={(e) => handleMeasurementTypeChange(e.target.value)}
                    disabled={isConfigLoading}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition font-medium cursor-pointer"
                  >
                    {configMeasurementTypes.map((mt) => (
                      <option key={mt.code} value={mt.code}>
                        {mt.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Format nilai actual dan tipe data pengukuran dari KPI Configuration.
                  </p>
                </div>
              </div>

              {/* 3. Unit & KPI Direction */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Unit (Satuan) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isTextType}
                    value={isTextType ? "Teks" : unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder={isTextType ? "Teks" : "Contoh: %, IDR, Hari, Kasus, Unit"}
                    className={`w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition font-medium ${
                      isTextType ? "bg-slate-100 text-slate-500 cursor-not-allowed select-none" : ""
                    }`}
                  />
                  <p className="text-[10px] text-blue-600 mt-1">
                    {isTextType
                      ? "Unit otomatis Teks untuk tipe pengukuran Kualitatif."
                      : "Mengikuti Measurement Type, digunakan sebagai label nilai kriteria."}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    KPI Direction <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={isTextType ? "NOT_APPLICABLE" : direction}
                    onChange={(e) => setDirection(e.target.value)}
                    disabled={isTextType || isConfigLoading}
                    className={`w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition font-medium ${
                      isTextType ? "bg-slate-100 text-slate-500 cursor-not-allowed select-none" : "cursor-pointer"
                    }`}
                  >
                    {isTextType ? (
                      <option value="NOT_APPLICABLE">Not Applicable (Tidak Berlaku)</option>
                    ) : (
                      configDirections.map((kd) => (
                        <option key={kd.code} value={kd.code}>
                          {kd.name}
                        </option>
                      ))
                    )}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {isTextType
                      ? "Arah KPI dinonaktifkan (Not Applicable) untuk tipe kualitatif."
                      : "Arah evaluasi capaian terhadap target."}
                  </p>
                </div>
              </div>

              {/* 4. Target & Scoring Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Target <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Satuan: {isTextType ? "Teks" : unit || "-"}
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    {isCurrency && (
                      <span className="absolute left-3 text-xs font-bold text-slate-500 font-mono select-none">
                        Rp
                      </span>
                    )}
                    <input
                      type="text"
                      required
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      placeholder={
                        isTextType
                          ? "Contoh: Memenuhi"
                          : isCurrency
                          ? "25.000.000"
                          : isPercentage
                          ? "100"
                          : "100"
                      }
                      className={`w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition font-mono ${
                        isCurrency ? "pl-9" : ""
                      } ${!isTextType && unit ? "pr-14" : ""}`}
                    />
                    {!isTextType && unit && (
                      <span className="absolute right-3 text-xs text-slate-400 font-bold font-mono select-none">
                        {unit}
                      </span>
                    )}
                  </div>
                  {isCurrency && target && !isNaN(Number(target.replace(/[^\d.-]/g, ""))) && (
                    <p className="text-[10px] text-slate-500 mt-1 font-mono">
                      Format Nilai: Rp {Number(target.replace(/[^\d.-]/g, "")).toLocaleString("id-ID")}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">
                    {isTextType
                      ? "Target ekspektasi kualitatif (misal: Memenuhi, Selesai, dsb)."
                      : `Format otomatis menyesuaikan Measurement Type (${measurementType}) dan Unit (${unit}).`}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Scoring Method <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={scoringMethod}
                    onChange={(e) => setScoringMethod(e.target.value)}
                    disabled={isConfigLoading}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition font-medium cursor-pointer"
                  >
                    {configScoringMethods.map((sm) => (
                      <option key={sm.code} value={sm.code}>
                        {sm.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Metode perhitungan skor akhir capaian indikator ini.
                  </p>
                </div>
              </div>

              {/* Kondisional Field Formula jika Scoring Method = FORMULA_BASED */}
              {scoringMethod === "FORMULA_BASED" && (
                <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-blue-600" />
                    <label className="text-xs font-bold text-slate-900">
                      Pilih Formula Engine <span className="text-rose-500">*</span>
                    </label>
                  </div>
                  <select
                    value={calculationRuleId ?? ""}
                    onChange={(e) =>
                      setCalculationRuleId(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition font-medium cursor-pointer"
                  >
                    <option value="">Pilih Formula Engine...</option>
                    {calculationRules.map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.name} ({rule.code})
                      </option>
                    ))}
                  </select>
                  {selectedRule && (
                    <div className="text-[11px] text-slate-600 space-y-0.5 pt-1 border-t border-blue-100">
                      <div>
                        <span className="font-semibold">Kode:</span> {selectedRule.code} |{" "}
                        <span className="font-semibold">Tipe:</span> {selectedRule.calculationType}
                      </div>
                      {selectedRule.description && (
                        <div>
                          <span className="font-semibold">Keterangan:</span> {selectedRule.description}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Kondisional Info jika Scoring Method = DIRECT_SCORE */}
              {scoringMethod === "DIRECT_SCORE" && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-slate-700 flex items-start gap-2 animate-in fade-in duration-150">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900">Metode Penilaian Langsung:</span>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                      Skor indikator ini diisi langsung secara diskresioner oleh Asesor pada tahap appraisal tanpa matriks rentang nilai kuantitatif atau formula otomatis.
                    </p>
                  </div>
                </div>
              )}

              {/* 5. Deskripsi */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Deskripsi / Petunjuk Pengukuran (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Jelaskan cara perhitungan atau sumber data verifikasi untuk indikator ini..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>
            </div>
          ) : (
            /* TAB 2: KRITERIA SCORING / FORMULA */
            <div className="space-y-3.5">
              {scoringMethod === "FORMULA_BASED" ? (
                /* TAB 2 UNTUK FORMULA BASED */
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
                      <Calculator className="w-4 h-4 text-blue-600" />
                      <span>Konfigurasi Formula Perhitungan</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Indikator ini menggunakan kalkulasi otomatis berbasis rumus Formula Engine. Calculation Engine akan menghitung achievement dari nilai Actual terhadap Target, lalu mengonversinya menjadi skor akhir.
                    </p>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Pilih Aturan Formula Engine <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={calculationRuleId ?? ""}
                        onChange={(e) =>
                          setCalculationRuleId(e.target.value ? Number(e.target.value) : null)
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition font-medium cursor-pointer"
                      >
                        <option value="">Pilih Formula Engine...</option>
                        {calculationRules.map((rule) => (
                          <option key={rule.id} value={rule.id}>
                            {rule.name} ({rule.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedRule && (
                      <div className="p-3 bg-white rounded-lg border border-blue-200 space-y-1.5 text-xs text-slate-700">
                        <div className="font-bold text-slate-900">{selectedRule.name}</div>
                        <div className="text-[11px] text-slate-500">
                          Kode Rule: <span className="font-mono text-slate-700">{selectedRule.code}</span> | Tipe Kalkulasi: <span className="font-semibold text-slate-700">{selectedRule.calculationType}</span>
                        </div>
                        {selectedRule.description && (
                          <p className="text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                            {selectedRule.description}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : scoringMethod === "DIRECT_SCORE" ? (
                /* TAB 2 UNTUK DIRECT SCORE */
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-2">
                  <Award className="w-8 h-8 text-amber-500 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-900">Metode Penilaian Langsung</h4>
                  <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                    Indikator ini tidak memerlukan matriks rentang kriteria atau rumus formula. Nilai skor akhir akan diinput langsung secara diskresioner oleh Asesor atau Penilai saat tahap pelaksanaan appraisal.
                  </p>
                </div>
              ) : (
                /* TAB 2 UNTUK CRITERIA BASED & RATING BASED */
                <>
                  {/* Presets and Actions Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-100">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-slate-500">Preset:</span>
                      {isTextType ? (
                        <>
                          <button
                            type="button"
                            onClick={() => applyPreset("text3")}
                            className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded transition cursor-pointer"
                          >
                            3 Level (Memenuhi, Sebagian, Tidak)
                          </button>
                          <button
                            type="button"
                            onClick={() => applyPreset("text2")}
                            className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded transition cursor-pointer"
                          >
                            2 Level (Ya, Tidak)
                          </button>
                        </>
                      ) : (
                        <>
                          {isPercentage && (
                            <>
                              <button
                                type="button"
                                onClick={() => applyPreset("standard3")}
                                className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded transition cursor-pointer"
                              >
                                3 Level (≥ 100%, 95 - 99%, &lt; 95%)
                              </button>
                              <button
                                type="button"
                                onClick={() => applyPreset("standard4")}
                                className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded transition cursor-pointer"
                              >
                                4 Level (100%, 95 - 99%, ...)
                              </button>
                            </>
                          )}
                          {isCurrency && (
                            <button
                              type="button"
                              onClick={() => applyPreset("currency")}
                              className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded transition cursor-pointer"
                            >
                              Nominal (≤ Rp25jt, Rp25 - 50jt, &gt; Rp50jt)
                            </button>
                          )}
                          {unit === "Insiden" && (
                            <button
                              type="button"
                              onClick={() => applyPreset("safety")}
                              className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded transition cursor-pointer"
                            >
                              Safety (0 Insiden, 1 - 2, &gt; 2)
                            </button>
                          )}
                          {unit === "Hari" && (
                            <button
                              type="button"
                              onClick={() => applyPreset("days")}
                              className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded transition cursor-pointer"
                            >
                              Hari (≤ 3 Hari, 4 - 7, &gt; 7)
                            </button>
                          )}
                          {unit === "SP" && (
                            <button
                              type="button"
                              onClick={() => applyPreset("sp")}
                              className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded transition cursor-pointer"
                            >
                              SP (SP 0, SP 1, SP 2, SP 3)
                            </button>
                          )}
                          {!isPercentage && !isCurrency && unit !== "Insiden" && unit !== "Hari" && unit !== "SP" && (
                            <button
                              type="button"
                              onClick={() => applyPreset("standard3")}
                              className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded transition cursor-pointer"
                            >
                              Standar (3 Level)
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
                      <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg cursor-pointer select-none transition">
                        <input
                          type="checkbox"
                          checked={isAutoFillEnabled}
                          onChange={(e) => setIsAutoFillEnabled(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>Auto-fill Aktif</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleTriggerAutoFill}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                        title="Kalkulasi otomatis baris berikutnya berdasarkan baris pertama"
                      >
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        <span>Auto-fill Baris</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAddCriteriaRow}
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Baris</span>
                      </button>
                    </div>
                  </div>

                  {/* Criteria Table: No | Kondisi | Nilai/Target/Value Text | Skor | Aksi */}
                  <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white shadow-2xs">
                    <table
                      className="text-left text-xs border-collapse"
                      style={{
                        tableLayout: "fixed",
                        width: `${totalTableWidth}px`,
                        minWidth: "100%",
                      }}
                    >
                      <colgroup>
                        <col style={{ width: `${colWidths.no}px` }} />
                        <col style={{ width: `${colWidths.operator}px` }} />
                        <col style={{ width: `${colWidths.value}px` }} />
                        <col style={{ width: `${colWidths.score}px` }} />
                        <col style={{ width: `${colWidths.action}px` }} />
                      </colgroup>
                      <thead className="bg-slate-50 border-b border-slate-200 select-none">
                        <tr className="text-[11px] font-bold text-slate-600">
                          {/* No */}
                          <th className="py-2.5 px-2 text-center relative">
                            No
                            <div
                              onMouseDown={(e) => handleStartResize(e, "no")}
                              className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-400/40 group flex items-center justify-center z-10"
                              title="Geser untuk mengatur lebar kolom"
                            >
                              <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                            </div>
                          </th>

                          {/* Kondisi */}
                          <th className="py-2.5 px-2.5 relative">
                            <span className="truncate block pr-1">Kondisi</span>
                            <div
                              onMouseDown={(e) => handleStartResize(e, "operator")}
                              className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-400/40 group flex items-center justify-center z-10"
                              title="Geser untuk mengatur lebar kolom"
                            >
                              <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                            </div>
                          </th>

                          {/* Nilai / Target / Value Text */}
                          <th className="py-2.5 px-2.5 relative">
                            <span className="truncate block pr-1">
                              {isTextType ? "Value Text" : `Nilai / Target (${unit || "%"})`}
                            </span>
                            <div
                              onMouseDown={(e) => handleStartResize(e, "value")}
                              className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-400/40 group flex items-center justify-center z-10"
                              title="Geser untuk mengatur lebar kolom"
                            >
                              <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                            </div>
                          </th>

                          {/* Skor */}
                          <th className="py-2.5 px-2 text-center relative">
                            <span className="truncate block">Skor</span>
                            <div
                              onMouseDown={(e) => handleStartResize(e, "score")}
                              className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-blue-400/40 group flex items-center justify-center z-10"
                              title="Geser untuk mengatur lebar kolom"
                            >
                              <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                            </div>
                          </th>

                          {/* Aksi */}
                          <th className="py-2.5 px-1.5 text-center">
                            Aksi
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {criteria.map((row, idx) => {
                          const isRange = row.operator === "BETWEEN";
                          const isTextEnum = row.operator === "TEXT";

                          return (
                            <tr key={row.id || idx} className="hover:bg-slate-50/60 transition-colors">
                              {/* No */}
                              <td className="py-2 px-2 text-center text-slate-400 font-mono text-[11px] overflow-hidden">
                                {idx + 1}
                              </td>

                              {/* Kondisi Dropdown: Text Mode (EQ, NEQ, CONTAINS) vs Numeric (<, <=, =, >, >=, BETWEEN) */}
                              <td className="py-2 px-2 overflow-hidden">
                                {isTextType ? (
                                  <select
                                    value={row.operator}
                                    onChange={(e) =>
                                      handleCriteriaChange(idx, "operator", e.target.value as any)
                                    }
                                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:border-blue-500 focus:outline-none transition font-semibold text-slate-800 cursor-pointer"
                                  >
                                    <option value="EQ">Equals (=)</option>
                                    <option value="NEQ">Not Equals (≠)</option>
                                    <option value="CONTAINS">Contains (Teks)</option>
                                  </select>
                                ) : (
                                  <select
                                    value={row.operator}
                                    onChange={(e) =>
                                      handleCriteriaChange(idx, "operator", e.target.value as any)
                                    }
                                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:border-blue-500 focus:outline-none transition font-semibold text-slate-800 cursor-pointer"
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

                              {/* Nilai Text vs Numeric Input / Range Inputs */}
                              <td className="py-2 px-2 overflow-hidden">
                                {isTextType ? (
                                  <input
                                    type="text"
                                    value={row.minValue}
                                    onChange={(e) => {
                                      handleCriteriaChange(idx, "minValue", e.target.value);
                                      handleCriteriaChange(idx, "maxValue", "");
                                    }}
                                    placeholder="Contoh: Memenuhi"
                                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition font-medium"
                                  />
                                ) : isTextEnum ? (
                                  <input
                                    type="text"
                                    value={row.minValue}
                                    onChange={(e) => handleCriteriaChange(idx, "minValue", e.target.value)}
                                    placeholder="Status (misal: Sesuai)"
                                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition"
                                  />
                                ) : isRange ? (
                                  <div className="flex items-center gap-1.5 w-full min-w-0">
                                    {isCurrency && (
                                      <span className="text-[11px] font-bold text-slate-500 shrink-0 font-mono">Rp</span>
                                    )}
                                    <input
                                      type="number"
                                      step="any"
                                      value={row.minValue}
                                      onChange={(e) =>
                                        handleCriteriaChange(idx, "minValue", e.target.value)
                                      }
                                      placeholder="Min"
                                      className="w-1/2 min-w-0 px-2 py-1.5 text-xs text-center border border-slate-200 rounded-lg font-mono focus:border-blue-500 focus:outline-none transition"
                                    />
                                    <span className="text-slate-400 text-xs font-bold shrink-0">s/d</span>
                                    {isCurrency && (
                                      <span className="text-[11px] font-bold text-slate-500 shrink-0 font-mono">Rp</span>
                                    )}
                                    <input
                                      type="number"
                                      step="any"
                                      value={row.maxValue}
                                      onChange={(e) =>
                                        handleCriteriaChange(idx, "maxValue", e.target.value)
                                      }
                                      placeholder="Max"
                                      className="w-1/2 min-w-0 px-2 py-1.5 text-xs text-center border border-slate-200 rounded-lg font-mono focus:border-blue-500 focus:outline-none transition"
                                    />
                                    {!isCurrency && unit && (
                                      <span className="text-[11px] text-slate-500 font-semibold font-mono shrink-0">
                                        {unit}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 w-full min-w-0">
                                    {isCurrency && (
                                      <span className="text-[11px] font-bold text-slate-500 shrink-0 font-mono">Rp</span>
                                    )}
                                    <input
                                      type="number"
                                      step="any"
                                      value={
                                        row.operator === "LT" || row.operator === "LTE"
                                          ? row.maxValue || row.minValue
                                          : row.minValue
                                      }
                                      onChange={(e) => {
                                        if (row.operator === "LT" || row.operator === "LTE") {
                                          handleCriteriaChange(idx, "maxValue", e.target.value);
                                          handleCriteriaChange(idx, "minValue", "");
                                        } else {
                                          handleCriteriaChange(idx, "minValue", e.target.value);
                                          handleCriteriaChange(idx, "maxValue", "");
                                        }
                                      }}
                                      placeholder={isCurrency ? "25000000" : "0"}
                                      className="w-full min-w-0 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg font-mono focus:border-blue-500 focus:outline-none transition"
                                    />
                                    {!isCurrency && unit && (
                                      <span className="text-[11px] text-slate-500 font-semibold font-mono shrink-0">
                                        {unit}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Skor */}
                              <td className="py-2 px-2 text-center overflow-hidden">
                                <input
                                  type="number"
                                  step="1"
                                  min="0"
                                  max="100"
                                  value={row.score}
                                  onChange={(e) => handleCriteriaChange(idx, "score", e.target.value)}
                                  placeholder="25"
                                  className="w-full px-2 py-1.5 text-xs text-center font-mono font-bold border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition bg-slate-50/50"
                                />
                              </td>

                              {/* Aksi */}
                              <td className="py-2 px-1 text-center overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCriteriaRow(idx)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                  title="Hapus Kriteria"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Status Validasi Kriteria: Gap, Overlap, & Incomplete */}
                  {criteriaValidation.hasErrors ? (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1.5 animate-in fade-in duration-150">
                      <div className="flex items-center gap-1.5 font-bold text-rose-900">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Validasi Kriteria Scoring Terdeteksi Masalah:</span>
                      </div>
                      <ul className="list-disc list-inside text-[11px] space-y-0.5 text-rose-700 pl-1">
                        {criteriaValidation.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                      <p className="text-[10px] text-rose-600 mt-0.5">
                        Harap perbaiki kriteria di atas agar perhitungan Calculation Engine akurat tanpa tumpang tindih.
                      </p>
                    </div>
                  ) : criteriaValidation.hasWarnings ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1.5 animate-in fade-in duration-150">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Peringatan Celah Nilai (Gap Terdeteksi):</span>
                      </div>
                      <ul className="list-disc list-inside text-[11px] space-y-0.5 text-amber-700 pl-1">
                        {criteriaValidation.warnings.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                      <p className="text-[10px] text-amber-600 mt-0.5">
                        Catatan: Pastikan celah nilai ini disengaja atau sesuaikan rentang agar seluruh capaian terdefinisi.
                      </p>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in duration-150">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-medium text-[11px]">
                        {isTextType
                          ? "Kriteria scoring kualitatif terstruktur valid: mapping teks dan skor sudah terdefinisi dengan benar."
                          : "Kriteria scoring terstruktur valid: semua rentang terdefinisi tanpa celah (gap) atau tumpang tindih (overlap)."}
                      </span>
                    </div>
                  )}

                  {/* Preview Hasil Scoring: Ditampilkan Ringkas di Bawah Tabel */}
                  <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-blue-600" />
                        Preview Hasil Scoring:
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {isTextType
                          ? "Otomatis dicocokkan berdasarkan kondisi teks kualitatif"
                          : "Otomatis dievaluasi sesuai rentang kriteria ini"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {criteria.map((row, idx) => {
                        const item = formatNaturalCriteria(row, isTextType ? "Teks" : unit);
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-white border border-slate-200 text-slate-800 shadow-2xs"
                          >
                            <span className="text-slate-400 font-sans text-[10px]">#{idx + 1}</span>
                            <span className="font-semibold text-blue-700">{item.condition || "-"}</span>
                            <span className="text-slate-300">→</span>
                            <span className="font-bold text-emerald-600">Skor {row.score || 0}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-xs transition cursor-pointer"
            >
              {isSaving ? "Menyimpan..." : "Simpan Indikator & Kriteria"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
