import type { ReactNode } from "react";
import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  actions,
  backHref,
  onBack,
  backLabel = "Kembali",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  backHref?: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50/60 hover:text-sky-900 transition cursor-pointer"
              title={backLabel || "Kembali"}
              aria-label={backLabel || "Kembali"}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          ) : backHref ? (
            <Link
              href={backHref}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50/60 hover:text-sky-900 transition cursor-pointer"
              title={backLabel || "Kembali"}
              aria-label={backLabel || "Kembali"}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
          ) : null}
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">{title}</h1>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, children, className = "", right }: { title?: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          {right}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, tone = "blue" }: { label: string; value: ReactNode; hint?: string; tone?: "blue" | "green" | "amber" | "rose" | "slate" }) {
  const tones = {
    blue: "from-sky-400 to-sky-600",
    green: "from-emerald-600 to-emerald-500",
    amber: "from-amber-600 to-amber-500",
    rose: "from-rose-600 to-rose-500",
    slate: "from-slate-700 to-slate-500",
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br ${tones[tone]} p-5 text-white shadow`}>
      <div className="text-xs uppercase tracking-wide text-white/80">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-white/80">{hint}</div>}
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "rose" | "blue" | "violet" }) {
  const map = {
    slate: "bg-slate-100 text-slate-700 border border-slate-200/80",
    green: "bg-emerald-50 text-emerald-800 border border-emerald-200/80",
    amber: "bg-amber-50 text-amber-800 border border-amber-200/80",
    rose: "bg-rose-50 text-rose-700 border border-rose-200/80",
    blue: "bg-sky-50 text-sky-700 border border-sky-200/80",
    violet: "bg-purple-50 text-purple-700 border border-purple-200/80",
  };
  return <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${map[tone]}`}>{children}</span>;
}

export function statusTone(status: string): "slate" | "green" | "amber" | "rose" | "blue" | "violet" {
  switch (status) {
    case "DRAFT": return "slate";
    case "SUBMITTED": return "amber";
    case "REVIEWED": return "blue";
    case "FINAL": return "green";
    case "ACTIVE": return "blue";
    case "CLOSED": return "rose";
    default: return "slate";
  }
}

export const inputCls = "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-400";
export const inputErrorCls = "w-full rounded-md border border-rose-500 bg-rose-50/40 px-2.5 py-1.5 text-sm focus:border-rose-600 focus:outline-none focus:ring-1 focus:ring-rose-500";
export const btnPrimary = "inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 active:scale-95 text-white text-xs font-bold px-4 py-2 shadow-xs hover:shadow transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer";
export const btnBoldSave = "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-black text-sm px-6 py-2.5 shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 cursor-pointer";
export const btnAmber = "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 hover:from-sky-600 hover:to-blue-700 px-5 py-2.5 text-sm font-black text-white shadow-md hover:shadow-lg transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer";
export const btnAmberSmall = "inline-flex items-center justify-center gap-1 rounded-md bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-3 py-1 text-xs shadow-md transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer";
export const btnSecondary = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs cursor-pointer";
export const btnDanger = "inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition shadow-2xs cursor-pointer";
export const btnSuccess = "inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 shadow-xs transition cursor-pointer";

export function Table({ head, children, className = "", tableClassName = "" }: { head: ReactNode; children: ReactNode; className?: string; tableClassName?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className={`w-full text-sm ${tableClassName}`}>
        <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-bold uppercase tracking-wider text-slate-600">{head}</thead>
        <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>
      </table>
    </div>
  );
}

export const th = "px-4 py-3 font-bold text-slate-600 text-[11px] tracking-wider uppercase bg-slate-50/80 border-b border-slate-200";
export const td = "px-4 py-3 align-middle text-slate-700 text-xs border-b border-slate-100";
