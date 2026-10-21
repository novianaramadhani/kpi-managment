/**
 * KPI Criteria Helper: Auto-fill generator and gap/overlap validator.
 * Built for structured scoring rules compatible with Calculation Engine.
 */

export interface CriteriaItem {
  id?: number | string;
  label?: string;
  operator: "GTE" | "LT" | "EQ" | "BETWEEN" | "GT" | "LTE" | "TEXT" | "NEQ" | "CONTAINS";
  minValue: string;
  maxValue: string;
  score: string;
  textEnum?: string;
  minInclusive?: boolean;
  maxInclusive?: boolean;
}

export interface CriteriaValidationResult {
  isValid: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
  errors: string[];
  warnings: string[];
}

export interface ParsedRangeResult {
  min: number;
  max: number;
  minInclusive: boolean;
  maxInclusive: boolean;
  unit?: string;
}

/**
 * Parses numeric range with support for min, max, comparison operators,
 * brackets, and unit strings (e.g. '%', 'hari', 'jam', 'dokumen').
 * Example inputs:
 * - "90 - 95%"
 * - "90 - 95 %"
 * - "3 hari - 4 hari"
 * - "3 - 4 hari"
 * - "3 s/d 4 Hari"
 * - ">90 - <=95"
 * - "[90, 95)"
 */
export function parseRangeValues(raw: string | null | undefined): ParsedRangeResult | null {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str) return null;

  // 1. Bracket notation: [90, 95], (90, 95], [3 hari, 4 hari], etc.
  const bracketMatch = str.match(
    /^([\[\(])\s*([0-9.]+)\s*(?:[A-Za-z%]+\s*)?(?:,|s\/d|sd|sampai|-|–|to)\s*([0-9.]+)\s*([A-Za-z%]+)?\s*([\]\)])$/i
  );
  if (bracketMatch) {
    const leftBracket = bracketMatch[1];
    const n1 = parseFloat(bracketMatch[2]);
    const n2 = parseFloat(bracketMatch[3]);
    const matchedUnit = bracketMatch[4]?.trim();
    const rightBracket = bracketMatch[5];
    if (!isNaN(n1) && !isNaN(n2)) {
      return {
        min: Math.min(n1, n2),
        max: Math.max(n1, n2),
        minInclusive: leftBracket === "[",
        maxInclusive: rightBracket === "]",
        unit: matchedUnit,
      };
    }
  }

  // 2. Inequality notation: 90 < x <= 95, 90 <= x < 95
  const ineqMatch = str.match(
    /([0-9.]+)\s*(?:[A-Za-z%]+\s*)?(<=|≤|<)\s*(?:x|[a-z]+)\s*(<=|≤|<)\s*([0-9.]+)\s*([A-Za-z%]+)?/i
  );
  if (ineqMatch) {
    const n1 = parseFloat(ineqMatch[1]);
    const op1 = ineqMatch[2];
    const op2 = ineqMatch[3];
    const n2 = parseFloat(ineqMatch[4]);
    const matchedUnit = ineqMatch[5]?.trim();
    if (!isNaN(n1) && !isNaN(n2)) {
      return {
        min: Math.min(n1, n2),
        max: Math.max(n1, n2),
        minInclusive: op1 === "<=" || op1 === "≤",
        maxInclusive: op2 === "<=" || op2 === "≤",
        unit: matchedUnit,
      };
    }
  }

  // 3. Standard range or inequality pair: "90 - 95%", "3 hari - 4 hari", "3 - 4 hari", "3 % - 4 %", etc.
  const rangeMatch = str.match(
    /(>=|≥|>|<=|≤|<|=)?\s*([0-9.]+)\s*(?:[A-Za-z%]+\s*)?(?:s\/d|sd|sampai|-|–|to|,|<)\s*(>=|≥|>|<=|≤|<|=)?\s*([0-9.]+)\s*([A-Za-z%]+)?/i
  );
  if (rangeMatch) {
    const opLeft = rangeMatch[1] || "";
    const n1 = parseFloat(rangeMatch[2]);
    const opRight = rangeMatch[3] || "";
    const n2 = parseFloat(rangeMatch[4]);
    const matchedUnit = rangeMatch[5]?.trim();
    if (!isNaN(n1) && !isNaN(n2)) {
      const minVal = Math.min(n1, n2);
      const maxVal = Math.max(n1, n2);

      let minInclusive = true;
      let maxInclusive = true;

      if (opLeft === ">") {
        minInclusive = false;
      } else if (opLeft === ">=" || opLeft === "≥") {
        minInclusive = true;
      }

      if (
        opRight === "<" ||
        str.includes("<" + rangeMatch[4]) ||
        str.includes("< " + rangeMatch[4])
      ) {
        maxInclusive = false;
      } else if (opRight === "<=" || opRight === "≤") {
        maxInclusive = true;
      }

      return {
        min: minVal,
        max: maxVal,
        minInclusive,
        maxInclusive,
        unit: matchedUnit,
      };
    }
  }

  return null;
}

export function extractSingleNumericValue(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const str = String(raw).trim();
  const m = str.match(/([0-9.]+)/);
  if (m) {
    const n = parseFloat(m[1]);
    return isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Extracts candidate unit string from a criteria value or label (e.g. 'hari', 'jam', 'dokumen', '%').
 */
export function extractCriteriaUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const str = String(raw).trim();
  if (str.includes("%")) return "%";
  if (/\b(?:rp|idr)\b/i.test(str) || str.startsWith("Rp")) return "Rp";
  const words = str.match(/[A-Za-z\u00C0-\u024F]+/g);
  if (!words) return null;
  for (const w of words) {
    const low = w.toLowerCase();
    if (
      [
        "s", "d", "sd", "sampai", "to", "rentang", "teks", "dan", "atau",
        "gt", "gte", "lt", "lte", "eq", "between", "min", "max", "tier",
        "kategori", "target", "tercapai", "kurang", "lebih", "sama", "dari", "dengan",
        "x", "null", "undefined"
      ].includes(low)
    ) {
      continue;
    }
    return w;
  }
  return null;
}

/**
 * Detects the dominant and authentic unit of an indicator across its parameter definition and criteria bands.
 */
export function detectIndicatorUnit<T extends { label?: string; criteriaValue?: string }>(
  paramUnit?: string | null,
  bands?: T[]
): string {
  const cleanParamUnit = (paramUnit || "").trim();

  // If parameter explicitly states a unit other than '%' or empty
  if (cleanParamUnit && cleanParamUnit !== "%") {
    return cleanParamUnit;
  }

  // Inspect criteria text in bands for specific contextual units (e.g. 'hari', 'jam', 'dokumen')
  if (bands && bands.length > 0) {
    const unitCounts = new Map<string, number>();
    for (const b of bands) {
      const u1 = extractCriteriaUnit(b.criteriaValue);
      const u2 = extractCriteriaUnit(b.label);
      const candidate = u1 || u2;
      if (candidate && candidate !== "%") {
        const canonical = candidate.toLowerCase();
        unitCounts.set(canonical, (unitCounts.get(canonical) || 0) + 1);
      }
    }

    let topUnit = "";
    let maxCount = 0;
    for (const [u, count] of unitCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        topUnit = u;
      }
    }

    if (topUnit && maxCount >= 1) {
      return topUnit;
    }
  }

  return cleanParamUnit || "%";
}

export function formatValueWithUnit(num: number | string, unit: string): string {
  const cleanU = (unit || "").trim();
  if (!cleanU) return String(num);
  if (cleanU === "%") return `${num}%`;
  if (cleanU.toLowerCase() === "rp" || cleanU.toLowerCase() === "idr") return `${cleanU} ${num}`;
  return `${num} ${cleanU}`;
}

export function formatRangeWithUnit(min: number, max: number, unit: string): string {
  const cleanU = (unit || "").trim();
  if (!cleanU) return `${min} - ${max}`;
  if (cleanU === "%") return `${min}% - ${max}%`;
  return `${min} - ${max} ${cleanU}`;
}

export interface HarmonizableBand {
  label: string;
  operator: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT";
  operatorSymbol?: string;
  criteriaValue?: string;
  minValue?: number | null;
  maxValue?: number | null;
  score: number;
  sortOrder: number;
  minInclusive?: boolean;
  maxInclusive?: boolean;
  isUnrecognizedOperator?: boolean;
  needsManualReview?: boolean;
  manualReviewReason?: string;
}

export interface AutoDeterminedBandValueResult {
  value: string;
  minValue: number | null;
  maxValue: number | null;
  isDetermined: boolean;
  needsManualReview: boolean;
  reason?: string;
  suggestedUnit: string;
}

/**
 * Automatically calculates and suggests criteria value based on selected operator,
 * adjacent criteria bands, and indicator unit.
 */
export function autoDetermineBandValue<T extends HarmonizableBand>(
  bands: T[],
  targetIndex: number,
  newOperatorSymbol: string,
  paramUnit?: string | null
): AutoDeterminedBandValueResult {
  const effectiveUnit = detectIndicatorUnit(paramUnit, bands);
  const targetBand = bands[targetIndex];
  const currentVal = (targetBand?.criteriaValue || "").trim();

  // If text operator
  if (newOperatorSymbol === "Teks") {
    const val = currentVal || "Memenuhi";
    return {
      value: val,
      minValue: null,
      maxValue: null,
      isDetermined: true,
      needsManualReview: false,
      suggestedUnit: effectiveUnit,
    };
  }

  if (newOperatorSymbol === "?") {
    return {
      value: currentVal,
      minValue: null,
      maxValue: null,
      isDetermined: false,
      needsManualReview: true,
      reason: "Operator belum ditentukan.",
      suggestedUnit: effectiveUnit,
    };
  }

  // Parse existing information from adjacent bands
  const prevBand = targetIndex > 0 ? bands[targetIndex - 1] : null;
  const nextBand = targetIndex < bands.length - 1 ? bands[targetIndex + 1] : null;

  const prevRange = prevBand ? parseRangeValues(prevBand.criteriaValue || prevBand.label) : null;
  const prevNum = prevRange ? prevRange.max : extractSingleNumericValue(prevBand?.criteriaValue || prevBand?.label);

  const nextRange = nextBand ? parseRangeValues(nextBand.criteriaValue || nextBand.label) : null;
  const nextNum = nextRange ? nextRange.min : extractSingleNumericValue(nextBand?.criteriaValue || nextBand?.label);

  const currentRange = parseRangeValues(currentVal || targetBand?.label);
  const currentNum = extractSingleNumericValue(currentVal || targetBand?.label);

  // Determine direction: Ascending (Lower is better, e.g. < 3, 3-4, > 4) vs Descending (Higher is better, e.g. >= 100, 90-100, < 90)
  const firstNum = extractSingleNumericValue(bands[0]?.criteriaValue || bands[0]?.label);
  const lastNum = extractSingleNumericValue(bands[bands.length - 1]?.criteriaValue || bands[bands.length - 1]?.label);
  const firstOp = bands[0]?.operatorSymbol || bands[0]?.operator;
  const isAscending = firstOp === "<" || firstOp === "<=" || firstOp === "LT" || firstOp === "LTE" || (firstNum !== null && lastNum !== null && firstNum < lastNum);

  // 1. Operator: RENTANG (BETWEEN)
  if (newOperatorSymbol === "Rentang") {
    // A. Current band already has valid range numbers (e.g. '3 % - 4 %' or '3 - 4')
    if (currentRange) {
      const minVal = currentRange.min;
      const maxVal = currentRange.max;
      return {
        value: formatRangeWithUnit(minVal, maxVal, effectiveUnit),
        minValue: minVal,
        maxValue: maxVal,
        isDetermined: true,
        needsManualReview: false,
        suggestedUnit: effectiveUnit,
      };
    }

    // B. Both previous and next bands have numeric boundaries
    if (prevNum !== null && nextNum !== null) {
      const minVal = Math.min(prevNum, nextNum);
      const maxVal = Math.max(prevNum, nextNum);
      if (minVal < maxVal) {
        return {
          value: formatRangeWithUnit(minVal, maxVal, effectiveUnit),
          minValue: minVal,
          maxValue: maxVal,
          isDetermined: true,
          needsManualReview: false,
          suggestedUnit: effectiveUnit,
        };
      }
    }

    // C. Single number from current value plus adjacent context
    if (currentNum !== null) {
      if (prevNum !== null && prevNum !== currentNum) {
        const minVal = Math.min(prevNum, currentNum);
        const maxVal = Math.max(prevNum, currentNum);
        return {
          value: formatRangeWithUnit(minVal, maxVal, effectiveUnit),
          minValue: minVal,
          maxValue: maxVal,
          isDetermined: true,
          needsManualReview: false,
          suggestedUnit: effectiveUnit,
        };
      }
      if (nextNum !== null && nextNum !== currentNum) {
        const minVal = Math.min(nextNum, currentNum);
        const maxVal = Math.max(nextNum, currentNum);
        return {
          value: formatRangeWithUnit(minVal, maxVal, effectiveUnit),
          minValue: minVal,
          maxValue: maxVal,
          isDetermined: true,
          needsManualReview: false,
          suggestedUnit: effectiveUnit,
        };
      }
    }

    // D. Only previous band exists
    if (prevNum !== null) {
      if (isAscending) {
        const minVal = prevNum;
        const maxVal = prevNum + 1;
        return {
          value: formatRangeWithUnit(minVal, maxVal, effectiveUnit),
          minValue: minVal,
          maxValue: maxVal,
          isDetermined: true,
          needsManualReview: false,
          suggestedUnit: effectiveUnit,
        };
      } else {
        const maxVal = prevNum;
        const step = prevNum === 100 ? 10 : Math.max(1, Math.round(prevNum * 0.1));
        const minVal = Math.max(0, prevNum - step);
        return {
          value: formatRangeWithUnit(minVal, maxVal, effectiveUnit),
          minValue: minVal,
          maxValue: maxVal,
          isDetermined: true,
          needsManualReview: false,
          suggestedUnit: effectiveUnit,
        };
      }
    }

    // E. Only next band exists
    if (nextNum !== null) {
      if (isAscending) {
        const maxVal = nextNum;
        const minVal = Math.max(0, nextNum - 1);
        return {
          value: formatRangeWithUnit(minVal, maxVal, effectiveUnit),
          minValue: minVal,
          maxValue: maxVal,
          isDetermined: true,
          needsManualReview: false,
          suggestedUnit: effectiveUnit,
        };
      } else {
        const minVal = nextNum;
        const step = nextNum >= 90 ? 10 : Math.max(1, Math.round(nextNum * 0.1));
        const maxVal = nextNum + step;
        return {
          value: formatRangeWithUnit(minVal, maxVal, effectiveUnit),
          minValue: minVal,
          maxValue: maxVal,
          isDetermined: true,
          needsManualReview: false,
          suggestedUnit: effectiveUnit,
        };
      }
    }

    return {
      value: currentVal || "",
      minValue: null,
      maxValue: null,
      isDetermined: false,
      needsManualReview: true,
      reason: "Batas rentang belum dapat ditentukan otomatis dari kriteria sekitar.",
      suggestedUnit: effectiveUnit,
    };
  }

  // 2. Operator: > atau >=
  if (newOperatorSymbol === ">" || newOperatorSymbol === ">=") {
    // Case A: Previous band is a range (takes upper bound, e.g. Rentang 3-4 -> 4)
    if (prevRange) {
      const val = prevRange.max;
      return {
        value: formatValueWithUnit(val, effectiveUnit),
        minValue: val,
        maxValue: null,
        isDetermined: true,
        needsManualReview: false,
        suggestedUnit: effectiveUnit,
      };
    }

    // Case B: Previous band is single number
    if (prevNum !== null) {
      return {
        value: formatValueWithUnit(prevNum, effectiveUnit),
        minValue: prevNum,
        maxValue: null,
        isDetermined: true,
        needsManualReview: false,
        suggestedUnit: effectiveUnit,
      };
    }

    // Case C: Current band has single number
    if (currentNum !== null) {
      return {
        value: formatValueWithUnit(currentNum, effectiveUnit),
        minValue: currentNum,
        maxValue: null,
        isDetermined: true,
        needsManualReview: false,
        suggestedUnit: effectiveUnit,
      };
    }

    // Case D: Next band is range and descending (e.g. next is 90-100 -> takes 100)
    if (nextRange) {
      const val = nextRange.max;
      return {
        value: formatValueWithUnit(val, effectiveUnit),
        minValue: val,
        maxValue: null,
        isDetermined: true,
        needsManualReview: false,
        suggestedUnit: effectiveUnit,
      };
    }

    return {
      value: currentVal || "",
      minValue: null,
      maxValue: null,
      isDetermined: false,
      needsManualReview: true,
      reason: "Batas nilai lebih besar belum dapat ditentukan otomatis.",
      suggestedUnit: effectiveUnit,
    };
  }

  // 3. Operator: < atau <=
  if (newOperatorSymbol === "<" || newOperatorSymbol === "<=") {
    // Case A: Next band is a range (takes lower bound, e.g. Rentang 3-4 -> 3)
    if (nextRange) {
      const val = nextRange.min;
      return {
        value: formatValueWithUnit(val, effectiveUnit),
        minValue: null,
        maxValue: val,
        isDetermined: true,
        needsManualReview: false,
        suggestedUnit: effectiveUnit,
      };
    }

    // Case B: Previous band is a range and descending (takes lower bound, e.g. Rentang 90-100 -> 90)
    if (prevRange && !isAscending) {
      const val = prevRange.min;
      return {
        value: formatValueWithUnit(val, effectiveUnit),
        minValue: null,
        maxValue: val,
        isDetermined: true,
        needsManualReview: false,
        suggestedUnit: effectiveUnit,
      };
    }

    // Case C: Current band has single number
    if (currentNum !== null) {
      return {
        value: formatValueWithUnit(currentNum, effectiveUnit),
        minValue: null,
        maxValue: currentNum,
        isDetermined: true,
        needsManualReview: false,
        suggestedUnit: effectiveUnit,
      };
    }

    // Case D: Next band has single number
    if (nextNum !== null) {
      return {
        value: formatValueWithUnit(nextNum, effectiveUnit),
        minValue: null,
        maxValue: nextNum,
        isDetermined: true,
        needsManualReview: false,
        suggestedUnit: effectiveUnit,
      };
    }

    return {
      value: currentVal || "",
      minValue: null,
      maxValue: null,
      isDetermined: false,
      needsManualReview: true,
      reason: "Batas nilai lebih kecil belum dapat ditentukan otomatis.",
      suggestedUnit: effectiveUnit,
    };
  }

  // 4. Operator: =
  if (newOperatorSymbol === "=") {
    if (currentNum !== null) {
      return {
        value: formatValueWithUnit(currentNum, effectiveUnit),
        minValue: currentNum,
        maxValue: currentNum,
        isDetermined: true,
        needsManualReview: false,
        suggestedUnit: effectiveUnit,
      };
    }
    if (prevNum !== null && nextNum !== null && prevNum === nextNum) {
      return {
        value: formatValueWithUnit(prevNum, effectiveUnit),
        minValue: prevNum,
        maxValue: prevNum,
        isDetermined: true,
        needsManualReview: false,
        suggestedUnit: effectiveUnit,
      };
    }
    const candidateNum = prevNum ?? nextNum;
    if (candidateNum !== null) {
      return {
        value: formatValueWithUnit(candidateNum, effectiveUnit),
        minValue: candidateNum,
        maxValue: candidateNum,
        isDetermined: true,
        needsManualReview: false,
        suggestedUnit: effectiveUnit,
      };
    }

    return {
      value: currentVal || "",
      minValue: null,
      maxValue: null,
      isDetermined: false,
      needsManualReview: true,
      reason: "Nilai sama dengan belum dapat ditentukan otomatis.",
      suggestedUnit: effectiveUnit,
    };
  }

  return {
    value: currentVal || "",
    minValue: null,
    maxValue: null,
    isDetermined: false,
    needsManualReview: true,
    reason: "Operator kriteria tidak dikenali.",
    suggestedUnit: effectiveUnit,
  };
}

/**
 * Automatically harmonizes criteria bands so that gaps and overlaps are closed seamlessly.
 * Adapts to indicator unit (e.g. 'hari', '%', 'dokumen') and supports both ascending and descending sequences.
 */
export function autoHarmonizeCriteriaBands<T extends HarmonizableBand>(
  bands: T[],
  unit = "%"
): T[] {
  if (!bands || bands.length < 2) return bands;

  // Detect true unit of the indicator
  const effectiveUnit = detectIndicatorUnit(unit, bands);

  // Skip qualitative text bands
  const isQualitative = bands.every((b) => {
    if (b.operator === "TEXT" || b.operatorSymbol === "Teks") return true;
    const raw = (b.criteriaValue || b.label || "").trim();
    return !/[0-9]/.test(raw);
  });
  if (isQualitative) return bands;

  const result: T[] = bands.map((b) => ({ ...b }));

  interface BandInfo {
    idx: number;
    op: string;
    score: number;
    low: number | null;
    high: number | null;
  }

  const infos: BandInfo[] = result.map((b, idx) => {
    const raw = (b.criteriaValue || b.label || "").trim();
    const effOp = b.operatorSymbol === "Rentang" ? "BETWEEN" : b.operator;

    let low: number | null = b.minValue ?? null;
    let high: number | null = b.maxValue ?? null;

    if (effOp === "BETWEEN") {
      const range = parseRangeValues(raw || b.label);
      if (range) {
        low = range.min;
        high = range.max;
      }
    } else if (
      effOp === "GT" ||
      effOp === "GTE" ||
      b.operatorSymbol === ">" ||
      b.operatorSymbol === ">="
    ) {
      low = extractSingleNumericValue(raw);
    } else if (
      effOp === "LT" ||
      effOp === "LTE" ||
      b.operatorSymbol === "<" ||
      b.operatorSymbol === "<="
    ) {
      high = extractSingleNumericValue(raw);
    } else if (effOp === "EQ" || b.operatorSymbol === "=") {
      const v = extractSingleNumericValue(raw);
      low = v;
      high = v;
    }

    return {
      idx,
      op: effOp,
      score: b.score,
      low,
      high,
    };
  });

  // Pattern 1: 3-band structure (Ascending e.g. < 3 hari, 3-4 hari, > 4 hari OR Descending e.g. >= 100%, 90-100%, < 90%)
  const ltBandInfo = infos.find((inf) => inf.op === "LT" || inf.op === "LTE");
  const gtBandInfo = infos.find((inf) => inf.op === "GT" || inf.op === "GTE");
  const midBands = infos.filter((inf) => inf.idx !== ltBandInfo?.idx && inf.idx !== gtBandInfo?.idx);

  if (ltBandInfo && gtBandInfo && midBands.length === 1 && ltBandInfo.high !== null && gtBandInfo.low !== null) {
    const midIdx = midBands[0].idx;
    const isAscendingOrder = ltBandInfo.idx < gtBandInfo.idx;

    const lowerBound = Math.min(ltBandInfo.high, gtBandInfo.low);
    const upperBound = Math.max(ltBandInfo.high, gtBandInfo.low);

    if (lowerBound < upperBound) {
      // 1. Harmonize middle range band
      result[midIdx].operator = "BETWEEN";
      result[midIdx].operatorSymbol = "Rentang";
      result[midIdx].minValue = lowerBound;
      result[midIdx].maxValue = upperBound;
      result[midIdx].minInclusive = true;
      result[midIdx].maxInclusive = true;
      const formattedMid = formatRangeWithUnit(lowerBound, upperBound, effectiveUnit);
      result[midIdx].criteriaValue = formattedMid;
      result[midIdx].label = formattedMid;
      result[midIdx].isUnrecognizedOperator = false;
      result[midIdx].needsManualReview = false;

      // 2. Harmonize lower band with consistent unit
      const ltIdx = ltBandInfo.idx;
      const ltOpSym = result[ltIdx].operatorSymbol === "<=" || result[ltIdx].operator === "LTE" ? "<=" : "<";
      result[ltIdx].operator = ltOpSym === "<=" ? "LTE" : "LT";
      result[ltIdx].operatorSymbol = ltOpSym;
      result[ltIdx].minValue = null;
      result[ltIdx].maxValue = lowerBound;
      result[ltIdx].criteriaValue = formatValueWithUnit(lowerBound, effectiveUnit);
      result[ltIdx].label = `${ltOpSym} ${result[ltIdx].criteriaValue}`;
      result[ltIdx].isUnrecognizedOperator = false;
      result[ltIdx].needsManualReview = false;

      // 3. Harmonize upper band with consistent unit
      const gtIdx = gtBandInfo.idx;
      let gtOpSym = result[gtIdx].operatorSymbol === ">=" || result[gtIdx].operator === "GTE" ? ">=" : ">";
      // If descending and threshold is 100, normalize to >= 100 so 100% is inclusive
      if (!isAscendingOrder && upperBound === 100 && gtOpSym === ">") {
        gtOpSym = ">=";
      }
      result[gtIdx].operator = gtOpSym === ">=" ? "GTE" : "GT";
      result[gtIdx].operatorSymbol = gtOpSym;
      result[gtIdx].minValue = upperBound;
      result[gtIdx].maxValue = null;
      result[gtIdx].criteriaValue = formatValueWithUnit(upperBound, effectiveUnit);
      result[gtIdx].label = `${gtOpSym} ${result[gtIdx].criteriaValue}`;
      result[gtIdx].isUnrecognizedOperator = false;
      result[gtIdx].needsManualReview = false;

      return result;
    }
  }

  // Pattern 2: General sequential bridging for any number of bands
  const validInfos = infos.filter((inf) => inf.low !== null || inf.high !== null);
  validInfos.sort((a, b) => {
    const valA = a.low ?? a.high ?? 0;
    const valB = b.low ?? b.high ?? 0;
    return valA - valB;
  });

  for (let i = 0; i < validInfos.length - 1; i++) {
    const cur = validInfos[i];
    const nxt = validInfos[i + 1];

    const curHigh = cur.high ?? cur.low;
    const nxtLow = nxt.low ?? nxt.high;

    if (curHigh !== null && nxtLow !== null && curHigh < nxtLow) {
      if (cur.op === "BETWEEN" && cur.low !== null) {
        result[cur.idx].maxValue = nxtLow;
        const valStr = formatRangeWithUnit(cur.low, nxtLow, effectiveUnit);
        result[cur.idx].criteriaValue = valStr;
        result[cur.idx].label = valStr;
        result[cur.idx].operator = "BETWEEN";
        result[cur.idx].operatorSymbol = "Rentang";
        result[cur.idx].isUnrecognizedOperator = false;
        result[cur.idx].needsManualReview = false;
        cur.high = nxtLow;
      } else if (nxt.op === "BETWEEN" && nxt.high !== null) {
        result[nxt.idx].minValue = curHigh;
        const valStr = formatRangeWithUnit(curHigh, nxt.high, effectiveUnit);
        result[nxt.idx].criteriaValue = valStr;
        result[nxt.idx].label = valStr;
        result[nxt.idx].operator = "BETWEEN";
        result[nxt.idx].operatorSymbol = "Rentang";
        result[nxt.idx].isUnrecognizedOperator = false;
        result[nxt.idx].needsManualReview = false;
        nxt.low = curHigh;
      }
    }
  }

  return result;
}

/**
 * Normalizes string number or returns null
 */
function parseNum(val: string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  const cleaned = String(val).trim().replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Formats a number for display in criteria, respecting Indonesian format if large
 */
export function formatCriteriaNumber(num: number): string {
  if (num % 1 !== 0) {
    return String(num);
  }
  return String(num);
}

/**
 * Auto-fills subsequent criteria rows based on the first row's configuration,
 * KPI direction, measurement type, unit, and target score.
 *
 * Example Lower is Better:
 * < 25.000.000 -> 25 automatically fills:
 * = 25.000.000 -> 15 and > 25.000.000 -> 5
 */
export function generateAutoFillCriteria(params: {
  firstRow: CriteriaItem;
  currentRows: CriteriaItem[];
  direction?: string;
  measurementType?: string;
  unit?: string;
}): CriteriaItem[] {
  const { firstRow, currentRows, direction = "HIGHER_IS_BETTER", measurementType = "PERCENTAGE", unit = "%" } = params;

  const rowCount = Math.max(3, currentRows.length);
  const op = firstRow.operator;

  // Text / Qualitative Auto-Fill
  const cleanMt = (measurementType || "").toUpperCase();
  const cleanU = (unit || "").toLowerCase();
  if (
    cleanMt === "TEXT" ||
    cleanMt === "QUALITATIVE" ||
    cleanMt === "KUALITATIF" ||
    cleanU === "teks" ||
    cleanU === "text" ||
    firstRow.operator === "TEXT"
  ) {
    const score1 = parseNum(firstRow.score) ?? 25;
    const score2 = String(Math.round(score1 * 0.6));
    const score3 = String(Math.round(score1 * 0.2));

    const result: CriteriaItem[] = [];
    result.push({
      ...firstRow,
      id: firstRow.id || "row-1",
    });

    const firstVal = (firstRow.minValue || firstRow.label || "Memenuhi").trim();
    if (firstVal.toLowerCase().includes("memenuhi")) {
      result.push({
        id: currentRows[1]?.id || "row-2",
        operator: "EQ",
        minValue: "Sebagian Memenuhi",
        maxValue: "",
        score: score2,
      });
      result.push({
        id: currentRows[2]?.id || "row-3",
        operator: "EQ",
        minValue: "Tidak Memenuhi",
        maxValue: "",
        score: score3,
      });
    } else if (firstVal.toLowerCase().includes("sesuai")) {
      result.push({
        id: currentRows[1]?.id || "row-2",
        operator: "EQ",
        minValue: "Sebagian Sesuai",
        maxValue: "",
        score: score2,
      });
      result.push({
        id: currentRows[2]?.id || "row-3",
        operator: "EQ",
        minValue: "Tidak Sesuai",
        maxValue: "",
        score: score3,
      });
    } else if (firstVal.toLowerCase().includes("lengkap")) {
      result.push({
        id: currentRows[1]?.id || "row-2",
        operator: "EQ",
        minValue: "Cukup Lengkap",
        maxValue: "",
        score: score2,
      });
      result.push({
        id: currentRows[2]?.id || "row-3",
        operator: "EQ",
        minValue: "Tidak Lengkap",
        maxValue: "",
        score: score3,
      });
    } else {
      result.push({
        id: currentRows[1]?.id || "row-2",
        operator: "EQ",
        minValue: `Sebagian ${firstVal}`,
        maxValue: "",
        score: score2,
      });
      result.push({
        id: currentRows[2]?.id || "row-3",
        operator: "EQ",
        minValue: `Tidak ${firstVal}`,
        maxValue: "",
        score: score3,
      });
    }

    return result;
  }

  // Extract threshold value from first row
  let rawVal = op === "LT" || op === "LTE" ? firstRow.maxValue || firstRow.minValue : firstRow.minValue;
  let valNum = parseNum(rawVal);
  if (valNum === null) {
    valNum = measurementType === "CURRENCY" ? 25000000 : 100;
  }

  const score1 = parseNum(firstRow.score) ?? 25;
  const score2 = String(Math.round(score1 * 0.6)); // e.g. 25 -> 15, 100 -> 60
  const score3 = String(Math.round(score1 * 0.2)); // e.g. 25 -> 5, 100 -> 20

  const isCurrency =
    measurementType === "CURRENCY" ||
    (unit || "").toLowerCase() === "idr" ||
    (unit || "").toLowerCase() === "rp" ||
    (unit || "").toLowerCase() === "rupiah";

  const isPercentage = measurementType === "PERCENTAGE" || unit === "%";

  const result: CriteriaItem[] = [];

  // Row 1 (User's input preserved)
  result.push({
    ...firstRow,
    id: firstRow.id || "row-1",
  });

  const dir = direction.toUpperCase();

  if (dir === "LOWER_IS_BETTER") {
    if (op === "LT") {
      // User example: < 25.000.000 -> 25 automatically becomes:
      // Row 2: = 25.000.000 -> 15
      // Row 3: > 25.000.000 -> 5
      const valStr = String(valNum);

      result.push({
        id: currentRows[1]?.id || "row-2",
        operator: "EQ",
        minValue: valStr,
        maxValue: valStr,
        score: score2,
      });

      result.push({
        id: currentRows[2]?.id || "row-3",
        operator: "GT",
        minValue: valStr,
        maxValue: "",
        score: score3,
      });
    } else if (op === "LTE") {
      const valStr = String(valNum);

      if (valNum === 0) {
        // Zero target (e.g. Safety 0 Insiden, SP 0)
        result.push({
          id: currentRows[1]?.id || "row-2",
          operator: "BETWEEN",
          minValue: "1",
          maxValue: "2",
          score: score2,
        });
        result.push({
          id: currentRows[2]?.id || "row-3",
          operator: "GT",
          minValue: "2",
          maxValue: "",
          score: score3,
        });
      } else if (valNum <= 10) {
        // Small discrete count (e.g. <= 3 Hari)
        const midStart = valNum + 1;
        const midEnd = valNum * 2 + 1;
        result.push({
          id: currentRows[1]?.id || "row-2",
          operator: "BETWEEN",
          minValue: String(midStart),
          maxValue: String(midEnd),
          score: score2,
        });
        result.push({
          id: currentRows[2]?.id || "row-3",
          operator: "GT",
          minValue: String(midEnd),
          maxValue: "",
          score: score3,
        });
      } else {
        // Large values / currency / percentage
        const midStart = valNum + 1;
        const midEnd = isCurrency ? valNum * 2 : Math.round(valNum * 1.5);
        result.push({
          id: currentRows[1]?.id || "row-2",
          operator: "BETWEEN",
          minValue: String(midStart),
          maxValue: String(midEnd),
          score: score2,
        });
        result.push({
          id: currentRows[2]?.id || "row-3",
          operator: "GT",
          minValue: String(midEnd),
          maxValue: "",
          score: score3,
        });
      }
    } else if (op === "EQ" && valNum === 0) {
      // SP 0 / Kasus 0
      result.push({
        id: currentRows[1]?.id || "row-2",
        operator: "EQ",
        minValue: "1",
        maxValue: "",
        score: score2,
      });
      result.push({
        id: currentRows[2]?.id || "row-3",
        operator: "EQ",
        minValue: "2",
        maxValue: "",
        score: String(Math.round(score1 * 0.4)),
      });
      if (rowCount >= 4) {
        result.push({
          id: currentRows[3]?.id || "row-4",
          operator: "GTE",
          minValue: "3",
          maxValue: "",
          score: "0",
        });
      }
    } else {
      // Fallback Lower is Better
      const valStr = String(valNum);
      result.push({
        id: currentRows[1]?.id || "row-2",
        operator: "EQ",
        minValue: valStr,
        maxValue: valStr,
        score: score2,
      });
      result.push({
        id: currentRows[2]?.id || "row-3",
        operator: "GT",
        minValue: valStr,
        maxValue: "",
        score: score3,
      });
    }
  } else if (dir === "EXACT_TARGET") {
    // Exact Target: = Target -> 25, Range [Target - d, Target + d] -> 15, < or > -> 5
    const delta = valNum > 20 ? (isCurrency ? Math.round(valNum * 0.05) : 5) : 1;
    result.push({
      id: currentRows[1]?.id || "row-2",
      operator: "BETWEEN",
      minValue: String(valNum - delta),
      maxValue: String(valNum + delta),
      score: score2,
    });
    result.push({
      id: currentRows[2]?.id || "row-3",
      operator: "LT",
      minValue: "",
      maxValue: String(valNum - delta),
      score: score3,
    });
  } else {
    // HIGHER_IS_BETTER (Default)
    if (op === "GTE" || op === "GT") {
      if (valNum === 100 || isPercentage) {
        // Standard percentage: >= 100 -> 25, 95 s/d 99 -> 15, < 95 -> 5
        result.push({
          id: currentRows[1]?.id || "row-2",
          operator: "BETWEEN",
          minValue: "95",
          maxValue: "99",
          score: score2,
        });
        result.push({
          id: currentRows[2]?.id || "row-3",
          operator: "LT",
          minValue: "",
          maxValue: "95",
          score: score3,
        });
      } else if (isCurrency || valNum >= 1000000) {
        // Currency / High Nominal
        const midMin = Math.round(valNum * 0.8);
        const midMax = valNum - 1;
        result.push({
          id: currentRows[1]?.id || "row-2",
          operator: "BETWEEN",
          minValue: String(midMin),
          maxValue: String(midMax),
          score: score2,
        });
        result.push({
          id: currentRows[2]?.id || "row-3",
          operator: "LT",
          minValue: "",
          maxValue: String(midMin),
          score: score3,
        });
      } else {
        // General number >= X
        const step = valNum > 20 ? 5 : 1;
        const midMin = Math.max(0, valNum - step * 2);
        const midMax = Math.max(0, valNum - 1);
        result.push({
          id: currentRows[1]?.id || "row-2",
          operator: "BETWEEN",
          minValue: String(midMin),
          maxValue: String(midMax),
          score: score2,
        });
        result.push({
          id: currentRows[2]?.id || "row-3",
          operator: "LT",
          minValue: "",
          maxValue: String(midMin),
          score: score3,
        });
      }
    } else if (op === "BETWEEN") {
      const minN = parseNum(firstRow.minValue) ?? 95;
      const maxN = parseNum(firstRow.maxValue) ?? 100;
      const span = Math.max(1, maxN - minN);
      result.push({
        id: currentRows[1]?.id || "row-2",
        operator: "BETWEEN",
        minValue: String(minN - span),
        maxValue: String(minN - 1),
        score: score2,
      });
      result.push({
        id: currentRows[2]?.id || "row-3",
        operator: "LT",
        minValue: "",
        maxValue: String(minN - span),
        score: score3,
      });
    } else {
      // Fallback Higher is Better:
      result.push({
        id: currentRows[1]?.id || "row-2",
        operator: "BETWEEN",
        minValue: String(Math.round(valNum * 0.9)),
        maxValue: String(Math.max(0, valNum - 1)),
        score: score2,
      });
      result.push({
        id: currentRows[2]?.id || "row-3",
        operator: "LT",
        minValue: "",
        maxValue: String(Math.round(valNum * 0.9)),
        score: score3,
      });
    }
  }

  // Preserve any remaining extra rows beyond row 3 if present in currentRows
  for (let i = 3; i < currentRows.length; i++) {
    result.push({
      ...currentRows[i],
      id: currentRows[i].id || `row-${i + 1}`,
    });
  }

  return result;
}

/**
 * Validates structured criteria for completeness, gap, and overlap.
 */
export function validateStructuredCriteria(
  criteria: CriteriaItem[],
  _direction = "HIGHER_IS_BETTER",
  unit = "%",
  measurementType = "PERCENTAGE"
): CriteriaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (criteria.length === 0) {
    return {
      isValid: false,
      hasErrors: true,
      hasWarnings: false,
      errors: ["Kriteria scoring tidak boleh kosong. Harap tambahkan minimal satu baris kriteria."],
      warnings: [],
    };
  }

  const cleanMeasurementType = (measurementType || "").toUpperCase().trim();
  const cleanUnit = (unit || "").toLowerCase().trim();

  // 1. Explicit text / qualitative indicators
  const isExplicitText =
    cleanMeasurementType === "TEXT" ||
    cleanMeasurementType === "QUALITATIVE" ||
    cleanMeasurementType === "KUALITATIF" ||
    cleanUnit === "teks" ||
    cleanUnit === "text" ||
    cleanUnit === "kualitatif";

  // 2. Contains qualitative operators
  const hasTextOperator = criteria.some(
    (c) => c.operator === "TEXT" || c.operator === "NEQ" || c.operator === "CONTAINS"
  );

  // 3. Criteria items contain qualitative text values rather than valid numbers
  const hasTextValues = criteria.some((c) => {
    const rawMin = (c.minValue || "").trim();
    const rawMax = (c.maxValue || "").trim();
    if (rawMin && isNaN(Number(rawMin)) && parseNum(rawMin) === null) return true;
    if (rawMax && isNaN(Number(rawMax)) && parseNum(rawMax) === null) return true;
    return false;
  });

  // 4. All rows are discrete categorical labels without numeric boundary values
  const isAllCategoricalLabels =
    criteria.length > 0 &&
    criteria.every(
      (c) =>
        !c.minValue &&
        !c.maxValue &&
        Boolean(c.label && c.label.trim())
    );

  const isText = isExplicitText || hasTextOperator || hasTextValues || isAllCategoricalLabels;

  if (isText) {
    // Validasi Kriteria Scoring untuk Pilihan Teks / Kualitatif
    const seenTexts = new Map<string, number>();

    criteria.forEach((row, idx) => {
      const rowNum = idx + 1;
      const scoreNum = parseNum(row.score);
      if (scoreNum === null) {
        errors.push(`Baris #${rowNum}: Skor wajib diisi angka valid.`);
      } else if (scoreNum < 0 || scoreNum > 100) {
        errors.push(`Baris #${rowNum}: Skor (${scoreNum}) harus bernilai antara 0 s/d 100.`);
      }

      // Ambil nilai teks dari label, minValue, textEnum, atau maxValue
      const textVal = (row.label || row.minValue || row.textEnum || row.maxValue || "").trim();
      if (!textVal) {
        errors.push(`Baris #${rowNum}: Nilai teks atau label pilihan kriteria wajib diisi.`);
      } else {
        const textKey = textVal.toLowerCase();
        if (seenTexts.has(textKey)) {
          errors.push(
            `Baris #${rowNum}: Duplikasi kriteria terdeteksi untuk pilihan teks "${textVal}" (sama dengan Baris #${seenTexts.get(textKey)}).`
          );
        } else {
          seenTexts.set(textKey, rowNum);
        }
      }
    });

    return {
      isValid: errors.length === 0,
      hasErrors: errors.length > 0,
      hasWarnings: false,
      errors,
      warnings: [],
    };
  }

  // 1. Check Incomplete Criteria (Numeric)
  criteria.forEach((row, idx) => {
    const rowNum = idx + 1;
    const scoreNum = parseNum(row.score);

    if (scoreNum === null) {
      errors.push(`Baris #${rowNum}: Skor wajib diisi angka valid.`);
    } else if (scoreNum < 0 || scoreNum > 100) {
      errors.push(`Baris #${rowNum}: Skor (${scoreNum}) harus bernilai antara 0 s/d 100.`);
    }

    if (row.operator === "BETWEEN") {
      let minN = parseNum(row.minValue);
      let maxN = parseNum(row.maxValue);

      if (minN === null || maxN === null) {
        const parsedR = parseRangeValues(row.label || row.minValue || row.maxValue);
        if (parsedR) {
          minN = parsedR.min;
          maxN = parsedR.max;
        }
      }

      if (minN === null || maxN === null) {
        errors.push(`Baris #${rowNum}: Rentang nilai belum lengkap (Batas Min dan Max wajib diisi).`);
      } else if (minN >= maxN) {
        errors.push(`Baris #${rowNum}: Batas Min (${minN}) harus lebih kecil dari batas Max (${maxN}).`);
      }
    } else if (row.operator === "LT" || row.operator === "LTE") {
      const val = parseNum(row.maxValue || row.minValue) ?? extractSingleNumericValue(row.label);
      if (val === null) {
        errors.push(`Baris #${rowNum}: Batas nilai (${row.operator === "LT" ? "<" : "≤"}) wajib diisi.`);
      }
    } else if (row.operator === "GT" || row.operator === "GTE" || row.operator === "EQ") {
      const val = parseNum(row.minValue || row.maxValue) ?? extractSingleNumericValue(row.label);
      if (val === null) {
        const symbol = row.operator === "GT" ? ">" : row.operator === "GTE" ? "≥" : "=";
        errors.push(`Baris #${rowNum}: Batas nilai (${symbol}) wajib diisi.`);
      }
    }
  });

  // If there are completeness errors, stop further overlap/gap math
  if (errors.length > 0) {
    return {
      isValid: false,
      hasErrors: true,
      hasWarnings: false,
      errors,
      warnings,
    };
  }

  // Helper interval representation for numerical analysis
  interface Interval {
    idx: number;
    op: string;
    low: number;
    high: number;
    lowInclusive: boolean;
    highInclusive: boolean;
    label: string;
  }

  const intervals: Interval[] = [];

  criteria.forEach((row, idx) => {
    const op = row.operator;
    let low = -Infinity;
    let high = Infinity;
    let lowInc = false;
    let highInc = false;
    let label = (row.label || "").trim();

    if (op === "BETWEEN") {
      let minN = parseNum(row.minValue);
      let maxN = parseNum(row.maxValue);
      let minInc = row.minInclusive ?? true;
      let maxInc = row.maxInclusive ?? true;

      const parsedR = parseRangeValues(row.label || row.minValue || row.maxValue);
      if (parsedR) {
        if (minN === null) minN = parsedR.min;
        if (maxN === null) maxN = parsedR.max;
        if (row.minInclusive === undefined) minInc = parsedR.minInclusive;
        if (row.maxInclusive === undefined) maxInc = parsedR.maxInclusive;
      }

      if (minN === null || maxN === null) return;
      low = minN;
      high = maxN;
      lowInc = minInc;
      highInc = maxInc;
      const cleanU = unit ? ` ${unit}` : "";
      label = label || `${minInc ? "" : "> "}${low} s/d ${maxInc ? "" : "< "}${high}${cleanU}`.trim();
    } else if (op === "LT") {
      const val = parseNum(row.maxValue || row.minValue) ?? extractSingleNumericValue(row.label);
      if (val === null) return;
      high = val;
      highInc = false;
      const cleanU = unit ? ` ${unit}` : "";
      label = label || `< ${high}${cleanU}`;
    } else if (op === "LTE") {
      const val = parseNum(row.maxValue || row.minValue) ?? extractSingleNumericValue(row.label);
      if (val === null) return;
      high = val;
      highInc = true;
      const cleanU = unit ? ` ${unit}` : "";
      label = label || `≤ ${high}${cleanU}`;
    } else if (op === "GT") {
      const val = parseNum(row.minValue || row.maxValue) ?? extractSingleNumericValue(row.label);
      if (val === null) return;
      low = val;
      lowInc = false;
      const cleanU = unit ? ` ${unit}` : "";
      label = label || `> ${low}${cleanU}`;
    } else if (op === "GTE") {
      const val = parseNum(row.minValue || row.maxValue) ?? extractSingleNumericValue(row.label);
      if (val === null) return;
      low = val;
      lowInc = true;
      const cleanU = unit ? ` ${unit}` : "";
      label = label || `≥ ${low}${cleanU}`;
    } else if (op === "EQ") {
      const val = parseNum(row.minValue || row.maxValue) ?? extractSingleNumericValue(row.label);
      if (val === null) return;
      low = val;
      high = val;
      lowInc = true;
      highInc = true;
      const cleanU = unit ? ` ${unit}` : "";
      label = label || `= ${val}${cleanU}`;
    } else {
      // Non-numeric operator (e.g. TEXT), skip interval overlap math
      return;
    }

    if ((isFinite(low) || isFinite(high)) && !isNaN(low) && !isNaN(high)) {
      intervals.push({
        idx: idx + 1,
        op,
        low,
        high,
        lowInclusive: lowInc,
        highInclusive: highInc,
        label,
      });
    }
  });

  // 2. Overlap Checking across all pairs
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const A = intervals[i];
      const B = intervals[j];

      const maxLow = Math.max(A.low, B.low);
      const minHigh = Math.min(A.high, B.high);

      let doesOverlap = false;
      let overlapDetail = "";

      if (maxLow < minHigh - 1e-6) {
        doesOverlap = true;
        const lowStr = isFinite(maxLow) ? `${maxLow}${unit}` : "";
        const highStr = isFinite(minHigh) ? `${minHigh}${unit}` : "";
        if (lowStr && highStr) {
          overlapDetail = `Rentang nilai ${lowStr} s/d ${highStr}`;
        } else if (lowStr) {
          overlapDetail = `Nilai di atas ${lowStr}`;
        } else if (highStr) {
          overlapDetail = `Nilai di bawah ${highStr}`;
        } else {
          overlapDetail = `Seluruh rentang nilai`;
        }
      } else if (Math.abs(maxLow - minHigh) <= 1e-6) {
        // Boundary case: check inclusiveness at the boundary point
        const aInc = maxLow === A.low ? A.lowInclusive : A.highInclusive;
        const bInc = maxLow === B.low ? B.lowInclusive : B.highInclusive;
        if (aInc && bInc) {
          doesOverlap = true;
          overlapDetail = `Titik nilai tepat ${maxLow}${unit}`;
        }
      }

      if (doesOverlap) {
        errors.push(
          `Overlap: ${overlapDetail} tumpang tindih antara Baris #${A.idx} (${A.label}) dan Baris #${B.idx} (${B.label}).`
        );
      }
    }
  }

  // 3. Gap Checking (adjacent sorted intervals checked sequentially)
  if (errors.length === 0 && intervals.length >= 2) {
    const sorted = [...intervals].sort((a, b) => {
      if (Math.abs(a.low - b.low) > 1e-6) return a.low - b.low;
      return a.high - b.high;
    });

    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const nxt = sorted[i + 1];

      // Check if gap exists between cur.high and nxt.low
      if (cur.high !== Infinity && nxt.low !== -Infinity) {
        const gapSize = nxt.low - cur.high;

        if (gapSize > 1e-6) {
          // There is a numeric gap between cur.high and nxt.low
          warnings.push(
            `Celah (Gap): Rentang nilai ${cur.high}${unit} s/d ${nxt.low}${unit} belum tercakup antara Baris #${cur.idx} (${cur.label}) dan Baris #${nxt.idx} (${nxt.label}).`
          );
        } else if (Math.abs(gapSize) <= 1e-6) {
          // Endpoints meet at exactly the same number: check inclusiveness
          if (!cur.highInclusive && !nxt.lowInclusive) {
            warnings.push(
              `Celah (Gap): Titik nilai tepat ${cur.high}${unit} belum tercakup antara Baris #${cur.idx} (${cur.label}) dan Baris #${nxt.idx} (${nxt.label}).`
            );
          }
        }
      }
    }
  }

  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;

  return {
    isValid: !hasErrors,
    hasErrors,
    hasWarnings,
    errors,
    warnings,
  };
}
