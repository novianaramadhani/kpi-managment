import type { KpiBand, KpiParameter } from "@/db/schema";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type ItemInput = {
  target: number | null;
  actual: number | null;
  monthlyTargets: (number | null)[] | null;
  monthlyActuals: (number | null)[] | null;
  qualitativeValue: string | null;
};

export type ItemResult = {
  annualActual: number | null;
  achievement: number | null;
  bandLabel: string | null;
  score: number;
  weightedScore: number; // kontribusi ke final KPI (0-1 fraction; 0.03 = 3%)
};

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

// ============================================================================
// CENTRALIZED GENERIC SCORING SERVICE (SINGLE SOURCE OF TRUTH)
// ============================================================================

export type GenericOperator =
  | "GT" | ">"
  | "GTE" | ">=" | "≥"
  | "LT" | "<"
  | "LTE" | "<=" | "≤"
  | "EQ" | "="
  | "NEQ" | "!=" | "≠"
  | "CONTAINS"
  | "BETWEEN" | "RANGE"
  | "TEXT";

export interface GenericScoringRule {
  id?: number | string;
  label: string;
  operator: GenericOperator | string;
  minValue?: number | null;
  maxValue?: number | null;
  score: number;
  sortOrder?: number;
  description?: string;
}

export interface ScoringContext {
  indicatorWeight: number | string;
  parameterWeight: number | string;
  maxScore?: number | string;
  compareBasis?: "ACTUAL" | "ACHIEVEMENT" | string;
  target?: number | string | null;
  direction?: string | null;
  measurementType?: string | null;
  unit?: string | null;
}

export interface KpiScoreResult {
  actualValue: number | string | null;
  realizationPct: number | null;
  realizationPctDisplay: string;
  matchedRule: GenericScoringRule | null;
  bandLabel: string | null;
  score: number | null;
  maxScore: number;
  indicatorWeightFraction: number;
  parameterWeightFraction: number;
  finalScoreFraction: number;
  finalScorePercentage: number;
  finalScoreDisplay: string;
  isFilled: boolean;
  isNotApplicable: boolean;
  status: "TARGET_TERCAPAI" | "PERLU_PERBAIKAN" | "DI_BAWAH_TARGET" | "BELUM_DIISI";
}

/**
 * Menghitung persentase Realisasi Aktual secara dinamis berdasarkan Target dan KPI Direction.
 * Aturan:
 * Higher is Better = (Actual / Target) * 100%
 * Lower is Better = (Target / Actual) * 100%
 * Text/Boolean / Not Applicable = Tidak menggunakan rumus persentase (return null, evaluasi langsung ke criteria).
 * Exact Target = Actual == Target ? 100% : 0%
 */
export function calculateDynamicRealization(
  actual: number | string | null | undefined,
  target: number | string | null | undefined,
  direction?: string | null,
  measurementType?: string | null,
  unit?: string | null
): {
  realizationPct: number | null;
  isNotApplicable: boolean;
  cleanDirection: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER" | "EXACT_TARGET" | "NOT_APPLICABLE";
} {
  const dirUpper = (direction || "").toUpperCase().trim();
  const mTypeUpper = (measurementType || "").toUpperCase().trim();
  const uLower = (unit || "").toLowerCase().trim();

  const isTextOrBool =
    dirUpper === "NOT_APPLICABLE" ||
    dirUpper === "NONE" ||
    mTypeUpper === "TEXT" ||
    mTypeUpper === "BOOLEAN" ||
    uLower === "teks" ||
    uLower === "biner" ||
    (typeof actual === "string" && isNaN(Number(actual)) && actual.trim() !== "");

  if (isTextOrBool) {
    return {
      realizationPct: null,
      isNotApplicable: true,
      cleanDirection: "NOT_APPLICABLE",
    };
  }

  let cleanDir: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER" | "EXACT_TARGET" | "NOT_APPLICABLE" = "HIGHER_IS_BETTER";
  if (dirUpper === "LOWER_IS_BETTER" || dirUpper === "INVERSE") {
    cleanDir = "LOWER_IS_BETTER";
  } else if (dirUpper === "EXACT_TARGET") {
    cleanDir = "EXACT_TARGET";
  } else if (uLower === "sp" || uLower === "insiden" || uLower === "kasus") {
    cleanDir = "LOWER_IS_BETTER";
  }

  if (actual === null || actual === undefined || String(actual).trim() === "") {
    return {
      realizationPct: null,
      isNotApplicable: false,
      cleanDirection: cleanDir,
    };
  }

  const actNum = typeof actual === "number" ? actual : parseFloat(String(actual).replace(/,/g, "."));
  const tgtNum = target !== null && target !== undefined && String(target).trim() !== ""
    ? (typeof target === "number" ? target : parseFloat(String(target).replace(/,/g, ".")))
    : null;

  if (isNaN(actNum) || tgtNum === null || isNaN(tgtNum)) {
    return {
      realizationPct: null,
      isNotApplicable: false,
      cleanDirection: cleanDir,
    };
  }

  let pct: number | null = null;

  if (cleanDir === "HIGHER_IS_BETTER") {
    if (tgtNum === 0) {
      pct = actNum >= 0 ? 100 : 0;
    } else {
      pct = parseFloat(((actNum / tgtNum) * 100).toFixed(2));
    }
  } else if (cleanDir === "LOWER_IS_BETTER") {
    if (actNum === 0 && tgtNum === 0) {
      pct = 100;
    } else if (actNum <= 0 && tgtNum > 0) {
      pct = 200;
    } else if (tgtNum === 0 && actNum > 0) {
      pct = 0;
    } else if (actNum > 0) {
      pct = parseFloat(((tgtNum / actNum) * 100).toFixed(2));
    }
  } else if (cleanDir === "EXACT_TARGET") {
    pct = actNum === tgtNum ? 100 : 0;
  }

  return {
    realizationPct: pct,
    isNotApplicable: false,
    cleanDirection: cleanDir,
  };
}

export function normalizeWeight(w: number | string | null | undefined): number {
  if (w === null || w === undefined) return 0;
  const numVal = typeof w === "number" ? w : parseFloat(String(w).replace(/,/g, "."));
  if (isNaN(numVal)) return 0;
  return numVal > 1 ? numVal / 100 : numVal;
}

export function matchGenericRule(
  rules: GenericScoringRule[],
  value: number | string | null | undefined
): GenericScoringRule | null {
  if (value === null || value === undefined || !rules || rules.length === 0) return null;

  const ordered = [...rules].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const isValNumeric = typeof value === "number" || (!isNaN(Number(value)) && String(value).trim() !== "");
  const numVal = isValNumeric ? Number(value) : null;
  const strVal = String(value).trim().toLowerCase();

  // 1. First pass: Standard exact operator matching
  for (const r of ordered) {
    const op = String(r.operator || "").toUpperCase();
    const min = r.minValue !== null && r.minValue !== undefined ? Number(r.minValue) : null;
    const max = r.maxValue !== null && r.maxValue !== undefined ? Number(r.maxValue) : null;

    if (op === "TEXT" || op === "CONTAINS" || (!isValNumeric && r.label)) {
      const ruleText = (r.label || "").toLowerCase();
      if (op === "CONTAINS" && strVal.includes(ruleText)) return r;
      if (ruleText === strVal) return r;
      if (ruleText.includes(strVal) && strVal.length > 0) return r;
      continue;
    }

    if (numVal === null) {
      if (r.label && r.label.toLowerCase() === strVal) return r;
      continue;
    }

    switch (op) {
      case "GT":
      case ">":
        if (min !== null && numVal > min) return r;
        break;
      case "GTE":
      case ">=":
      case "≥":
        if (min !== null && numVal >= min) return r;
        break;
      case "LT":
      case "<":
        if (max !== null && numVal < max) return r;
        break;
      case "LTE":
      case "<=":
      case "≤":
        if (max !== null && numVal <= max) return r;
        break;
      case "EQ":
      case "=":
        if (min !== null && numVal === min) return r;
        break;
      case "NEQ":
      case "!=":
      case "≠":
        if (min !== null && numVal !== min) return r;
        break;
      case "BETWEEN":
      case "RANGE":
        if (min !== null && max !== null && numVal >= min && numVal <= max) return r;
        break;
      default:
        if (min !== null && max !== null && numVal >= min && numVal <= max) return r;
        if (min !== null && numVal >= min) return r;
        if (r.label && r.label.toLowerCase() === strVal) return r;
        break;
    }
  }

  // 2. Second pass: Continuous range matching for decimal gaps between adjacent integer bands (e.g. 99.4 between 99 and 100)
  if (numVal !== null) {
    for (const rLower of ordered) {
      const maxA = rLower.maxValue !== null && rLower.maxValue !== undefined ? Number(rLower.maxValue) : null;
      if (maxA === null) continue;

      for (const rHigher of ordered) {
        if (rLower === rHigher) continue;
        const minB = rHigher.minValue !== null && rHigher.minValue !== undefined ? Number(rHigher.minValue) : null;
        if (minB === null) continue;

        if (minB > maxA) {
          // Check if any other rule has a threshold strictly between maxA and minB
          const hasIntermediate = ordered.some((other) => {
            if (other === rLower || other === rHigher) return false;
            const oMin = other.minValue !== null && other.minValue !== undefined ? Number(other.minValue) : null;
            const oMax = other.maxValue !== null && other.maxValue !== undefined ? Number(other.maxValue) : null;
            return (oMin !== null && oMin > maxA && oMin < minB) || (oMax !== null && oMax > maxA && oMax < minB);
          });

          if (!hasIntermediate && numVal > maxA && numVal < minB) {
            // Assign to the conservative tier (the tier with lower score that wasn't surpassed)
            const scoreA = Number(rLower.score) || 0;
            const scoreB = Number(rHigher.score) || 0;
            return scoreA <= scoreB ? rLower : rHigher;
          }
        }
      }
    }
  }

  return null;
}

/**
 * FORMULA RESMI PERUSAHAAN:
 * Final Score = (Score / Max Score) * Bobot Indikator * Bobot Parameter
 */
export function calculateKpiScore(
  actualValue: number | string | null | undefined,
  rules: GenericScoringRule[],
  context: ScoringContext
): KpiScoreResult {
  const maxScore = Number(context.maxScore) || 25;
  const pWeight = normalizeWeight(context.indicatorWeight);
  const cWeight = normalizeWeight(context.parameterWeight);

  const { realizationPct, isNotApplicable } = calculateDynamicRealization(
    actualValue,
    context.target,
    context.direction,
    context.measurementType,
    context.unit
  );

  const realizationPctDisplay = realizationPct !== null ? `${realizationPct.toFixed(1)}%` : "-";

  if (actualValue === null || actualValue === undefined || String(actualValue).trim() === "") {
    return {
      actualValue: null,
      realizationPct: null,
      realizationPctDisplay: "-",
      matchedRule: null,
      bandLabel: null,
      score: 0,
      maxScore,
      indicatorWeightFraction: pWeight,
      parameterWeightFraction: cWeight,
      finalScoreFraction: 0,
      finalScorePercentage: 0,
      finalScoreDisplay: "0.0%",
      isFilled: false,
      isNotApplicable,
      status: "BELUM_DIISI",
    };
  }

  let matched: GenericScoringRule | null = null;

  if (isNotApplicable) {
    matched = matchGenericRule(rules, actualValue);
  } else {
    const isNumeric = typeof actualValue === "number" || (!isNaN(Number(actualValue)) && String(actualValue).trim() !== "");
    const numActual = isNumeric ? Number(actualValue) : null;
    const rulesHavePercent = rules.some(
      (r) =>
        (r.label && r.label.includes("%")) ||
        (r.minValue !== null && r.minValue !== undefined && Number(r.minValue) > 30) ||
        (r.maxValue !== null && r.maxValue !== undefined && Number(r.maxValue) > 30)
    );
    const isAchievementBasis =
      context.compareBasis === "ACHIEVEMENT" ||
      (context.compareBasis !== "ACTUAL" && (rulesHavePercent || context.unit === "%"));

    if (isAchievementBasis && realizationPct !== null) {
      matched = matchGenericRule(rules, realizationPct);
      if (!matched && numActual !== null) {
        matched = matchGenericRule(rules, numActual);
      }
    } else {
      if (numActual !== null) {
        matched = matchGenericRule(rules, numActual);
      }
      if (!matched && realizationPct !== null) {
        matched = matchGenericRule(rules, realizationPct);
      }
    }
  }

  const isFilled = actualValue !== null && actualValue !== undefined && String(actualValue).trim() !== "";
  const score = matched ? Number(matched.score) || 0 : (isFilled ? null : 0);
  const bandLabel = matched ? (matched.label || `${matched.score}`) : (isFilled ? "Tidak cocok" : null);

  const finalScoreFraction =
    maxScore > 0 && score !== null ? parseFloat(((score / maxScore) * pWeight * cWeight).toFixed(6)) : 0;
  const finalScorePercentage = parseFloat((finalScoreFraction * 100).toFixed(2));
  const finalScoreDisplay = score !== null ? `${finalScorePercentage.toFixed(1)}%` : "-";

  let status: "TARGET_TERCAPAI" | "PERLU_PERBAIKAN" | "DI_BAWAH_TARGET" | "BELUM_DIISI" = "DI_BAWAH_TARGET";
  if (score !== null && score >= maxScore) {
    status = "TARGET_TERCAPAI";
  } else if (score !== null && score >= maxScore * 0.6) {
    status = "PERLU_PERBAIKAN";
  }

  return {
    actualValue: typeof actualValue === "number" ? actualValue : String(actualValue).trim(),
    realizationPct,
    realizationPctDisplay,
    matchedRule: matched,
    bandLabel,
    score,
    maxScore,
    indicatorWeightFraction: pWeight,
    parameterWeightFraction: cWeight,
    finalScoreFraction,
    finalScorePercentage,
    finalScoreDisplay,
    isFilled: true,
    isNotApplicable,
    status,
  };
}

/** Hitung skor agregasi 1 parameter dari sekumpulan indikator */
export function calculateParameterScore(
  indicatorResults: { finalScoreFraction: number }[]
): {
  totalFraction: number;
  totalPercentage: number;
  totalDisplay: string;
} {
  const sum = indicatorResults.reduce((acc, curr) => acc + (curr.finalScoreFraction || 0), 0);
  const totalFraction = parseFloat(sum.toFixed(6));
  const totalPercentage = parseFloat((totalFraction * 100).toFixed(2));
  return {
    totalFraction,
    totalPercentage,
    totalDisplay: `${totalPercentage.toFixed(1)}%`,
  };
}

/** Hitung total skor keseluruhan karyawan dari seluruh kelompok parameter */
export function calculateOverallKpiScore(
  parameterScores: { totalFraction: number }[]
): {
  overallScoreFraction: number;
  overallScorePercentage: number;
  overallScoreDisplay: string;
  grade: "A" | "B" | "C" | "D" | "E";
  label: string;
  action: string;
} {
  const sum = parameterScores.reduce((acc, curr) => acc + (curr.totalFraction || 0), 0);
  const overallScoreFraction = parseFloat(sum.toFixed(6));
  const overallScorePercentage = parseFloat((overallScoreFraction * 100).toFixed(2));
  const pa = performanceActionOf(overallScorePercentage);

  return {
    overallScoreFraction,
    overallScorePercentage,
    overallScoreDisplay: `${overallScorePercentage.toFixed(1)}%`,
    grade: pa.grade,
    label: pa.label,
    action: pa.action,
  };
}

/** Menghitung actual tahunan dari data bulanan berdasarkan metode agregasi */
export function aggregateMonthly(
  method: KpiParameter["aggregation"],
  actuals: (number | null)[],
  targets: (number | null)[]
): { annualActual: number | null; annualTarget: number | null } {
  const a = actuals.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  const t = targets.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (a.length === 0) return { annualActual: null, annualTarget: null };
  const sumA = a.reduce((s, v) => s + v, 0);
  const sumT = t.reduce((s, v) => s + v, 0);
  switch (method) {
    case "SUM":
      return { annualActual: sumA, annualTarget: t.length ? sumT : null };
    case "LAST_VALUE":
      return { annualActual: a[a.length - 1], annualTarget: t.length ? t[t.length - 1] : null };
    case "RATIO":
      return { annualActual: sumT > 0 ? (sumA / sumT) * 100 : null, annualTarget: 100 };
    case "AVERAGE":
    default:
      return { annualActual: sumA / a.length, annualTarget: t.length ? sumT / t.length : null };
  }
}

/** Cocokkan nilai numerik ke band criteria */
export function matchBand(bands: KpiBand[], value: number): KpiBand | null {
  const ordered = [...bands].sort((x, y) => x.sortOrder - y.sortOrder);
  for (const b of ordered) {
    const min = num(b.minValue);
    const max = num(b.maxValue);
    switch (b.operator) {
      case "GT":
        if (min !== null && value > min) return b;
        break;
      case "GTE":
        if (min !== null && value >= min) return b;
        break;
      case "LT":
        if (max !== null && value < max) return b;
        break;
      case "LTE":
        if (max !== null && value <= max) return b;
        break;
      case "EQ":
        if (min !== null && value === min) return b;
        break;
      case "BETWEEN":
        if (min !== null && max !== null && value >= min && value <= max) return b;
        break;
      default:
        break;
    }
  }
  return null;
}

export function bandLabelText(b: KpiBand): string {
  const min = num(b.minValue);
  const max = num(b.maxValue);
  switch (b.operator) {
    case "GT": return `> ${min}`;
    case "GTE": return `≥ ${min}`;
    case "LT": return `< ${max}`;
    case "LTE": return `≤ ${max}`;
    case "EQ": return `= ${min}`;
    case "BETWEEN": return `${min} – ${max}`;
    default: return b.label;
  }
}

/**
 * Scoring 1 parameter.
 * weightedScore = (score / maxScore) × bobotParameter × bobotKategori
 */
export function scoreItem(
  param: KpiParameter,
  bands: KpiBand[],
  categoryWeight: number,
  input: ItemInput
): ItemResult {
  const maxScore = num(param.maxScore) ?? 25;
  const pWeight = num(param.weight) ?? 0;
  const empty: ItemResult = { annualActual: null, achievement: null, bandLabel: null, score: 0, weightedScore: 0 };

  let band: KpiBand | null = null;
  let annualActual: number | null = null;
  let achievement: number | null = null;

  if (param.inputType === "QUALITATIVE" || (param as any).measurementType === "TEXT") {
    if (!input.qualitativeValue) return empty;
    const cleanQual = input.qualitativeValue.trim().toLowerCase();
    band =
      bands.find((b) => {
        const bLabel = (b.label || "").trim().toLowerCase();
        const bMin = b.minValue !== null && b.minValue !== undefined ? String(b.minValue).trim().toLowerCase() : "";
        return bLabel === cleanQual || (bMin !== "" && bMin === cleanQual);
      }) ?? null;
  } else {
    let target = input.target;
    const mActuals = input.monthlyActuals ?? [];
    const hasMonthlyActuals =
      Array.isArray(mActuals) &&
      mActuals.some((v) => v !== null && v !== undefined && !Number.isNaN(Number(v)));

    if (param.inputType === "MONTHLY_ACTUAL" || param.isMonthly || hasMonthlyActuals) {
      const agg = aggregateMonthly(param.aggregation, mActuals, input.monthlyTargets ?? []);
      annualActual = agg.annualActual;
      if (agg.annualTarget !== null && target === null) target = agg.annualTarget;
      if (annualActual === null && input.actual !== null && input.actual !== undefined) {
        annualActual = input.actual;
      }
    } else {
      annualActual = input.actual;
    }
    if (annualActual === null) return empty;
    if (target !== null && target !== 0) achievement = (annualActual / target) * 100;
    const basis = param.compareBasis === "ACHIEVEMENT" ? achievement : annualActual;
    if (basis === null) return { ...empty, annualActual, achievement };
    band = matchBand(bands, basis);
  }

  const score = band ? num(band.score) ?? 0 : 0;
  const weightedScore = maxScore > 0 ? (score / maxScore) * pWeight * categoryWeight : 0;
  return { annualActual, achievement, bandLabel: band?.label ?? null, score, weightedScore };
}

export function tenureMonths(dateOfHire: string | null | undefined, evaluationDate: string): number {
  if (!dateOfHire || !dateOfHire.trim()) return 0;
  const a = new Date(dateOfHire);
  if (isNaN(a.getTime())) return 0;
  const b = new Date(evaluationDate);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
}

export function formatTenureYears(dateOfHire: string | null | undefined, evaluationDate: string): string {
  if (!dateOfHire || !dateOfHire.trim()) return "-";
  try {
    const a = new Date(dateOfHire);
    if (isNaN(a.getTime())) return "-";
    const m = tenureMonths(dateOfHire, evaluationDate);
    if (isNaN(m)) return "-";
    return formatTenureYearsFromMonths(m);
  } catch {
    return "-";
  }
}

export function formatTenureYearsFromMonths(m: number): string {
  const years = Math.floor(m / 12);
  const remMonths = m % 12;

  if (years === 0) {
    return `${remMonths} bulan`;
  }
  if (remMonths === 0) {
    return `${years} tahun`;
  }
  return `${years} tahun ${remMonths} bulan`;
}

const MONTH_NAMES_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

/** Format tanggal persis template: DD-Mmm-YYYY (contoh: 18-Feb-2025) */
export function formatDateMedium(dateStr?: string | null): string {
  if (!dateStr || !dateStr.trim()) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTH_NAMES_ID[d.getMonth()] || "";
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/** Format masa kerja persis template: X Tahun, Y Bulan, Z Hari */
export function formatTenureExact(dateOfHire?: string | null, targetDate?: string): string {
  if (!dateOfHire || !dateOfHire.trim()) return "-";
  const start = new Date(dateOfHire);
  const end = targetDate ? new Date(targetDate) : new Date();
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return "0 Tahun, 0 Bulan, 0 Hari";
  }

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonthLastDay = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    days += prevMonthLastDay;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${years} Tahun, ${months} Bulan, ${days} Hari`;
}

export type PerformanceAction = {
  grade: "A" | "B" | "C" | "D" | "E";
  label: string;
  action: string;
  color: string;
  badgeTone: "emerald" | "green" | "amber" | "orange" | "rose";
  badgeBg: string;
};

export function performanceActionOf(finalPct: number): PerformanceAction {
  if (finalPct >= 90) {
    return {
      grade: "A",
      label: "Outstanding",
      action: "Reward / Promotion",
      color: "bg-emerald-600",
      badgeTone: "emerald",
      badgeBg: "bg-emerald-100 text-emerald-800 border-emerald-300",
    };
  }
  if (finalPct >= 80) {
    return {
      grade: "B",
      label: "Exceeds Expectations",
      action: "Reward / Bonus",
      color: "bg-green-600",
      badgeTone: "green",
      badgeBg: "bg-green-100 text-green-800 border-green-300",
    };
  }
  if (finalPct >= 70) {
    return {
      grade: "C",
      label: "Meets Expectations",
      action: "Maintain & Skill Training",
      color: "bg-amber-500",
      badgeTone: "amber",
      badgeBg: "bg-amber-100 text-amber-800 border-amber-300",
    };
  }
  if (finalPct >= 60) {
    return {
      grade: "D",
      label: "Needs Improvement",
      action: "Targeted Coaching",
      color: "bg-orange-600",
      badgeTone: "orange",
      badgeBg: "bg-orange-100 text-orange-800 border-orange-300",
    };
  }
  return {
    grade: "E",
    label: "Unsatisfactory",
    action: "Improvement Plan (PIP)",
    color: "bg-rose-600",
    badgeTone: "rose",
    badgeBg: "bg-rose-100 text-rose-800 border-rose-300",
  };
}

export function gradeOf(finalPct: number): { label: string; color: string; action: string } {
  const pa = performanceActionOf(finalPct);
  return { label: pa.label, color: pa.color, action: pa.action };
}

export const fmtPct = (v: number | string | null | undefined, digits = 1) =>
  v === null || v === undefined ? "-" : `${(Number(v) * 100).toFixed(digits)}%`;

export const fmtNum = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? "-" : Number(v).toLocaleString("id-ID", { maximumFractionDigits: 2 });

export function calculateGap(target: number | null, actual: number | null, unit?: string | null): {
  diff: number | null;
  formatted: string;
  isPositive: boolean | null;
} {
  if (target === null || actual === null) {
    return { diff: null, formatted: "—", isPositive: null };
  }
  const diff = Number((actual - target).toFixed(2));
  const isZero = Math.abs(diff) < 0.0001;
  const isPositive = isZero ? null : diff > 0;
  const sign = diff > 0 ? "+" : "";
  const unitStr = unit ? (unit === "%" ? "%" : ` ${unit}`) : "";
  return {
    diff,
    formatted: `${sign}${fmtNum(diff)}${unitStr}`,
    isPositive,
  };
}

export function getEvaluationStatus(score: number, maxScore: number, achievement: number | null): {
  label: string;
  badgeTone: "emerald" | "amber" | "rose" | "slate";
  badgeClass: string;
  icon: string;
} {
  if (maxScore <= 0 || (score === 0 && achievement === null)) {
    return {
      label: "Belum Diisi",
      badgeTone: "slate",
      badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
      icon: "○",
    };
  }
  const ratio = score / maxScore;
  if (ratio >= 0.99 || (achievement !== null && achievement >= 100)) {
    return {
      label: "Target Tercapai",
      badgeTone: "emerald",
      badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
      icon: "✓",
    };
  }
  if (ratio >= 0.5 || (achievement !== null && achievement >= 75)) {
    return {
      label: "Perlu Improvement",
      badgeTone: "amber",
      badgeClass: "bg-amber-100 text-amber-800 border-amber-300",
      icon: "⚠",
    };
  }
  return {
    label: "Di Bawah Target",
    badgeTone: "rose",
    badgeClass: "bg-rose-100 text-rose-800 border-rose-300",
    icon: "✕",
  };
}

export function formatCurrencyIdr(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(Number(val))) return "";
  return "Rp " + Math.round(Number(val)).toLocaleString("id-ID");
}

export function parseCurrencyIdr(str: string): number | null {
  if (!str) return null;
  const clean = str.replace(/[^0-9,-]/g, "").replace(",", ".");
  const n = Number(clean);
  return isNaN(n) ? null : n;
}
