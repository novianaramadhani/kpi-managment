import React from "react";

export interface HeaderFilterSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  leftIcon?: React.ReactNode;
  containerClassName?: string;
}

export function HeaderFilterSelect({
  label,
  leftIcon,
  className = "",
  containerClassName = "",
  children,
  ...props
}: HeaderFilterSelectProps) {
  return (
    <div className={`flex items-center gap-2 ${containerClassName}`}>
      {label && <span className="font-medium text-slate-600 text-xs shrink-0">{label}</span>}
      <div className="relative inline-flex items-center min-w-0">
        {leftIcon && (
          <div className="pointer-events-none absolute left-3 flex items-center text-slate-400 z-10">
            {leftIcon}
          </div>
        )}
        <select
          {...props}
          className={`h-10 rounded-xl border border-slate-200 bg-white ${
            leftIcon ? "pl-9" : "pl-3.5"
          } pr-10 text-xs font-semibold text-slate-800 hover:border-slate-300 focus:border-blue-500 focus:outline-none transition cursor-pointer appearance-none truncate shadow-2xs ${className}`}
        >
          {children}
        </select>
        {/* Single custom gray chevron on the right */}
        <div className="pointer-events-none absolute right-3 flex items-center text-slate-400">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </div>
    </div>
  );
}
