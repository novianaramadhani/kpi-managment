"use client";

import React from "react";
import Link from "next/link";

interface TemplateEditorFooterProps {
  totalCatWeightPct?: number;
  templateTargetPct?: number;
  isCatWeightValid?: boolean;
  isAllParamsValid?: boolean;
  isValidToPublish?: boolean;
  activeCatName?: string;
  activeCatParamWeight?: number;
  isPending: boolean;
  onPreview?: () => void;
  onSaveDraft: () => void;
  onPublish?: () => void;
}

export function TemplateEditorFooter({
  isPending,
  onSaveDraft,
}: TemplateEditorFooterProps) {
  return (
    <div className="sticky bottom-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 border-t border-slate-200/90 bg-white/95 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-3.5 shadow-lg transition-all">
      <div className="mx-auto max-w-7xl flex items-center justify-end gap-2.5">
        <Link
          href="/setup/templates"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
        >
          Batal
        </Link>

        <button
          type="button"
          onClick={onSaveDraft}
          disabled={isPending}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
        >
          Simpan Draft
        </button>
      </div>
    </div>
  );
}
