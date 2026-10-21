import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "KPI SYSTEM · Performance Management",
  description: "Sistem Manajemen Kinerja & Penilaian KPI Karyawan",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const currentUser = await getCurrentUser();

  return (
    <html lang="id" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased" suppressHydrationWarning>
        <AppShell initialUser={currentUser}>{children}</AppShell>
      </body>
    </html>
  );
}
