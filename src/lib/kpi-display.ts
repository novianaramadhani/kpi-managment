/**
 * Natural language formatter for KPI criteria and scoring bands.
 * Ensures that formulas and calculation engines receive structured data,
 * while end-user views and previews display clear, natural text
 * (e.g. "≥ 98% → 25", "95% s/d 97% → 15", "< 95% → 5").
 */

export interface NaturalCriteriaResult {
  condition: string;
  score: string;
  display: string;
}

export function formatNaturalCriteria(
  band: {
    operator?: string | null;
    minValue?: string | number | null;
    maxValue?: string | number | null;
    score?: string | number | null;
    label?: string | null;
  },
  unit?: string | null
): NaturalCriteriaResult {
  const u = (unit || "").trim();
  const rawOp = (band.operator || "GTE").toUpperCase();
  const min =
    band.minValue !== null && band.minValue !== undefined && band.minValue !== ""
      ? Number(band.minValue)
      : null;
  const max =
    band.maxValue !== null && band.maxValue !== undefined && band.maxValue !== ""
      ? Number(band.maxValue)
      : null;
  const score =
    band.score !== null && band.score !== undefined
      ? String(Number(band.score))
      : "0";

  const isRupiah =
    u === "Rp" ||
    u.toLowerCase() === "nominal" ||
    u.toLowerCase() === "rupiah";

  const formatVal = (val: number | null): string => {
    if (val === null || isNaN(val)) return "";
    if (isRupiah) {
      return `Rp${val.toLocaleString("id-ID")}`;
    }
    if (u === "%") {
      return `${val}%`;
    }
    if (u && u !== "CUSTOM") {
      return `${val} ${u}`;
    }
    return `${val}`;
  };

  let condition = "";

  if (rawOp === "TEXT") {
    condition = band.label || (band.minValue ? String(band.minValue) : "Pilihan");
  } else if (rawOp === "NEQ" || rawOp === "NOT_EQUALS") {
    const val = band.minValue || band.label || "-";
    condition = `≠ "${val}"`;
  } else if (rawOp === "CONTAINS") {
    const val = band.minValue || band.label || "-";
    condition = `Contains "${val}"`;
  } else if (rawOp === "EQ" || rawOp === "EQUAL") {
    if (u.toLowerCase() === "teks" || min === null || isNaN(min)) {
      condition = band.minValue ? String(band.minValue) : band.label || "-";
    } else if (u === "Insiden" || u === "Kasus") {
      condition = `${min ?? 0} ${u}`;
    } else if (u === "SP") {
      condition = `SP ${min ?? 0}`;
    } else {
      condition = `= ${formatVal(min)}`;
    }
  } else if (rawOp === "BETWEEN") {
    if (u === "%") {
      condition = `${min ?? 0}% - ${max ?? 100}%`;
    } else if (isRupiah) {
      condition = `Rp${(min ?? 0).toLocaleString("id-ID")} - Rp${(max ?? 0).toLocaleString("id-ID")}`;
    } else if (u && u !== "CUSTOM") {
      condition = `${min ?? 0} - ${max ?? 0} ${u}`;
    } else {
      condition = `${min ?? 0} - ${max ?? 0}`;
    }
  } else if (rawOp === "GTE" || rawOp === "GREATER_EQUAL") {
    condition = `≥ ${formatVal(min)}`;
  } else if (rawOp === "GT" || rawOp === "GREATER_THAN") {
    condition = `> ${formatVal(min)}`;
  } else if (rawOp === "LTE" || rawOp === "LESS_EQUAL") {
    condition = `≤ ${formatVal(max ?? min)}`;
  } else if (rawOp === "LT" || rawOp === "LESS_THAN") {
    condition = `< ${formatVal(max ?? min)}`;
  } else {
    condition = band.label || `${min ?? ""}`;
  }

  return {
    condition,
    score,
    display: `${condition} → ${score}`,
  };
}
