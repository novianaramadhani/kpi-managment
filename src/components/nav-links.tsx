"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/admin", label: "Admin Menu" },
  { href: "/input-kpi", label: "Penilaian KPI" },
  { href: "/setup/templates", label: "Template KPI" },
  { href: "/report", label: "Report & Export" },
  { href: "/audit", label: "Audit Trail" },
];

export function NavLinks({ compact }: { compact?: boolean }) {
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);

  if (compact) {
    return (
      <nav className="flex gap-1.5 overflow-x-auto text-xs">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-md px-2.5 py-1 font-semibold ${
              isActive(l.href) ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-1 p-3">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
            isActive(l.href) ? "bg-white/20 text-white font-bold" : "text-green-100 hover:bg-white/10"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
