"use client";

import React, { useState, useRef, useEffect } from "react";
import { formatNaturalCriteria } from "@/lib/kpi-display";

export interface CriterionItem {
  label: string;
  operator?: string;
  minValue?: number | null;
  maxValue?: number | null;
  score: number;
}

interface KpiCriteriaPopoverProps {
  kpiName: string;
  targetDisplay: string;
  unit?: string;
  criteria: CriterionItem[];
}

export function KpiCriteriaPopover({
  kpiName,
  targetDisplay,
  unit,
  criteria,
}: KpiCriteriaPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 transition cursor-pointer"
        title="Lihat Kriteria Penilaian Skor"
      >
        <svg
          className="w-3 h-3 text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>View Criteria</span>
      </button>

      {isOpen && (
        <div
          className="absolute z-50 mt-1.5 w-80 rounded-xl bg-white p-3.5 shadow-xl border border-slate-200 text-xs animate-in fade-in zoom-in-95 duration-150"
          style={{ minWidth: "280px" }}
        >
          {/* Header Popover */}
          <div className="flex items-start justify-between pb-2 mb-2.5 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Criteria Scoring
              </span>
              <h5 className="font-bold text-slate-900 text-xs leading-tight">
                {kpiName}
              </h5>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Target: <strong className="text-slate-800 font-mono font-bold">{targetDisplay}</strong>
                {unit && unit !== "%" ? ` ${unit}` : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-100 transition cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          {/* Criteria List */}
          <div className="space-y-1.5">
            {criteria.length === 0 ? (
              <p className="text-slate-400 italic text-center py-2">Belum ada rentang skor</p>
            ) : (
              criteria.map((c, idx) => {
                const natural = formatNaturalCriteria(c, unit);
                const scoreNum = Number(c.score);

                let badgeColor = "bg-slate-100 text-slate-700 border-slate-200";
                if (scoreNum >= 20) {
                  badgeColor = "bg-emerald-50 text-emerald-800 border-emerald-200";
                } else if (scoreNum >= 15) {
                  badgeColor = "bg-blue-50 text-blue-800 border-blue-200";
                } else if (scoreNum >= 10) {
                  badgeColor = "bg-amber-50 text-amber-800 border-amber-200";
                } else {
                  badgeColor = "bg-rose-50 text-rose-800 border-rose-200";
                }

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-150 hover:bg-slate-100/70 transition gap-2"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-slate-800 text-xs truncate">
                        {c.label}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {natural.condition}
                      </span>
                    </div>
                    <span
                      className={`font-mono font-bold text-xs px-2 py-0.5 rounded border shrink-0 ${badgeColor}`}
                    >
                      {natural.score}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer note */}
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <span>Format Kalkulasi Natural</span>
            <span className="font-bold text-slate-500 uppercase tracking-wider">READ ONLY</span>
          </div>
        </div>
      )}
    </div>
  );
}
