import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const modules = [
    {
      title: "Master Data",
      subtitle: "Kelola karyawan, departemen, jabatan, job levels & unit operasional",
      href: "/setup/master?tab=karyawan",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      ),
      iconBg: "bg-teal-50 text-teal-600",
    },
    {
      title: "Penugasan & Delegasi",
      subtitle: "Penugasan asesor KPI (Many-to-Many), delegasi & bulk template",
      href: "/setup/assignments?tab=penugasan-asesor",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
      iconBg: "bg-emerald-50 text-emerald-600",
    },
    {
      title: "Hak Akses & Hirarki",
      subtitle: "Kelola matriks otoritas modul & hirarki penilai karyawan",
      href: "/setup/access?tab=hak-akses",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      iconBg: "bg-indigo-50 text-indigo-600",
    },
    {
      title: "KPI Configuration",
      subtitle: "Measurement Type, KPI Direction & Scoring Method terpadu",
      href: "/setup/kpi-config?tab=measurement",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
      ),
      iconBg: "bg-blue-50 text-blue-600",
    },
    {
      title: "Templates",
      subtitle: "View and manage KPI matrix form templates",
      href: "/setup/templates",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
      iconBg: "bg-purple-50 text-purple-600",
    },
    {
      title: "Approvals",
      subtitle: "Manage pending reviews & final approvals",
      href: "/review",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      iconBg: "bg-amber-50 text-amber-600",
    },
    {
      title: "Input KPI",
      subtitle: "Input realisasi & evaluasi penilaian KPI bulanan",
      href: "/input-kpi",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
      iconBg: "bg-blue-50 text-blue-600",
    },
    {
      title: "Reports",
      subtitle: "View analytics, score reports & export Excel",
      href: "/report",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      iconBg: "bg-emerald-50 text-emerald-600",
    },
    {
      title: "Periode KPI",
      subtitle: "Manage evaluation schedule & cut-off window",
      href: "/setup/periode",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      iconBg: "bg-sky-50 text-sky-600",
    },
    {
      title: "System Settings",
      subtitle: "Manage system clock, Odoo ERP & profile",
      href: "/setup/config",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      iconBg: "bg-rose-50 text-rose-600",
    },
    {
      title: "Formula Rules",
      subtitle: "Master aturan formula kalkulasi, target achievement & versioning",
      href: "/setup/formulas",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      iconBg: "bg-blue-50 text-blue-600",
    },
    {
      title: "Audit Trail",
      subtitle: "View activity logs and audit history",
      href: "/audit",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      iconBg: "bg-slate-100 text-slate-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-100 bg-white text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition active:scale-95 cursor-pointer"
          title="Kembali ke Dashboard"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Admin Menu</h1>
          <p className="text-xs text-slate-400 mt-0.5">System administration and management modules</p>
        </div>
      </div>

      {/* Grid Menu Kartu (Clean Cards) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <Link
            key={m.title}
            href={m.href}
            className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-2xs hover:border-slate-300 hover:shadow-md transition-all active:scale-[0.99] group cursor-pointer"
          >
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition group-hover:scale-105 ${m.iconBg}`}>
              {m.icon}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-slate-800 text-sm group-hover:text-emerald-700 transition truncate">
                {m.title}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 leading-snug line-clamp-1">
                {m.subtitle}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
