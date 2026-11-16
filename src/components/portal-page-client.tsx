"use client";

import React, { useState, useTransition } from "react";
import { loginWithNik, changeUserPasswordAction, logoutUser, type UserSession } from "@/lib/auth";
import Swal from "sweetalert2";
import { Eye, EyeOff } from "lucide-react";

interface PortalPageClientProps {
  currentUser: UserSession | null;
  activePeriod: {
    name: string;
    evaluationDate: string;
  } | null;
  empCount?: number;
  depCount?: number;
}

export function PortalPageClient({
  currentUser,
  activePeriod,
  empCount,
  depCount,
}: PortalPageClientProps) {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(
    Boolean(currentUser?.mustChangePassword)
  );
  const [loginStep, setLoginStep] = useState<"LOGIN" | "CHANGE_PASSWORD">(
    currentUser?.mustChangePassword ? "CHANGE_PASSWORD" : "LOGIN"
  );
  const [loggedInUser, setLoggedInUser] = useState<UserSession | null>(currentUser);

  const [nik, setNik] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleOpenLogin = () => {
    setErrorMessage("");
    setLoginStep("LOGIN");
    setIsLoginModalOpen(true);
  };

  const handleCloseLogin = async () => {
    if (!isPending) {
      if (currentUser?.mustChangePassword || loggedInUser?.mustChangePassword) {
        await logoutUser();
        setLoggedInUser(null);
        window.location.reload();
        return;
      }
      setIsLoginModalOpen(false);
      setErrorMessage("");
      setLoginStep("LOGIN");
    }
  };

  const executeLogin = (nikToUse: string, passwordToUse: string) => {
    setErrorMessage("");
    if (!nikToUse.trim()) {
      setErrorMessage("Silakan masukkan Nomor Induk Karyawan (NIK) Anda.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await loginWithNik(nikToUse, passwordToUse);
        if (res.success && res.session) {
          // Jika pengguna wajib ubah password, tetap di modal landing page pada step 2!
          if (res.session.mustChangePassword) {
            setLoggedInUser(res.session);
            setNewPassword("");
            setLoginStep("CHANGE_PASSWORD");
            setErrorMessage("");
            return;
          }

          void Swal.fire({
            icon: "success",
            title: `Selamat Datang, ${res.session.name}!`,
            text: `Berhasil masuk sebagai ${res.session.role}. Membuka dashboard...`,
            timer: 1300,
            showConfirmButton: false,
          });

          // Hard navigation agar cookie terbaca sempurna tanpa Next.js soft-routing delay
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 300);
        } else {
          setErrorMessage(res.error || "Gagal masuk. Silakan periksa kembali NIK Anda.");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat login";
        if (msg.includes("Server Action") && msg.includes("was not found")) {
          // Versi aplikasi di server baru saja diperbarui, reload otomatis untuk memuat aset terbaru
          window.location.reload();
          return;
        }
        setErrorMessage(msg);
      }
    });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeLogin(nik, password);
  };

  const handleChangePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    const cleanNew = newPassword.trim();
    if (!cleanNew) {
      setErrorMessage("Kata sandi baru tidak boleh kosong.");
      return;
    }
    if (cleanNew.length < 4) {
      setErrorMessage("Kata sandi baru minimal harus 4 karakter.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await changeUserPasswordAction(cleanNew, loggedInUser?.nik || nik);
        if (res.success) {
          void Swal.fire({
            icon: "success",
            title: "Kata Sandi Berhasil Diperbarui!",
            text: `Selamat datang, ${loggedInUser?.name || "Karyawan"}! Membuka dashboard...`,
            timer: 1500,
            showConfirmButton: false,
          });

          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 400);
        } else {
          setErrorMessage(res.error || "Gagal memperbarui kata sandi.");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
        if (msg.includes("Server Action") && msg.includes("was not found")) {
          window.location.reload();
          return;
        }
        setErrorMessage(msg);
      }
    });
  };


  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-sky-500 selection:text-white">
      {/* Top Navigation Bar (Clean Light Theme) */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 via-blue-600 to-indigo-600 font-black text-white text-xs shadow-sm shadow-blue-500/20">
              GPE
            </div>
            <div>
              <span className="font-black tracking-wider text-slate-900 text-sm block leading-none">
                PT GRAHA PRIMA ENERGY
              </span>
              <span className="block text-[10px] text-sky-600 font-bold uppercase tracking-wider mt-0.5">
                Performance Management System
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#tentang-gpe" className="hover:text-sky-600 transition">Tentang GPE</a>
            <a href="#pilar-kinerja" className="hover:text-sky-600 transition">Pilar Kinerja</a>
            <a href="#keunggulan" className="hover:text-sky-600 transition">Keunggulan Sistem</a>
          </nav>
        </div>
      </header>

      {/* Hero Section (Clean Corporate Concept - PT Graha Prima Energy) */}
      <section className="relative overflow-hidden bg-gradient-to-b from-sky-50/60 via-white to-slate-50 pt-16 pb-20 md:pt-24 md:pb-24">
        {/* Soft Ambient Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[350px] bg-sky-200/30 blur-[120px] rounded-full pointer-events-none" />

        <div className="mx-auto max-w-5xl px-6 text-center relative z-10">
          {/* Active Period Pill */}
          {activePeriod && (
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50/80 px-4 py-1.5 text-xs font-semibold text-sky-800 shadow-2xs mb-8">
              <span className="flex h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
              <span>Periode Berjalan: <b>{activePeriod.name}</b></span>
              <span className="text-sky-300">·</span>
              <span className="text-slate-500">PT Graha Prima Energy</span>
            </div>
          )}

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-slate-900 leading-tight">
            Sistem Manajemen Kinerja &{" "}
            <span className="bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 bg-clip-text text-transparent">
              KPI Karyawan Terpadu
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
            Platform evaluasi target kinerja dan pencapaian indikator KPI karyawan <strong>PT Graha Prima Energy</strong> yang objektif, transparan, dan terukur demi mendorong keunggulan operasional, keselamatan kerja (HSE), dan pertumbuhan berkelanjutan.
          </p>

          {/* Action CTA Buttons */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={handleOpenLogin}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 hover:from-sky-600 hover:to-blue-700 px-8 py-3.5 text-sm font-bold text-white shadow-md shadow-sky-600/25 transition transform hover:-translate-y-0.5 cursor-pointer active:scale-98"
            >
              <span>Login Portal KPI</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </section>

      {/* Profil Perusahaan & Nilai Budaya (Tentang PT Graha Prima Energy) */}
      <section id="tentang-gpe" className="py-20 bg-white border-y border-slate-200">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-700 bg-sky-50 px-3 py-1 rounded-full border border-sky-200">
              Tentang PT Graha Prima Energy
            </span>
            <h2 className="mt-3 text-3xl font-black text-slate-900">
              Komitmen Keunggulan Operasional & Manajemen Berkelanjutan
            </h2>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Sebagai mitra strategis di sektor jasa pertambangan dan penyedia energi terkemuka, <strong>PT Graha Prima Energy (GPE)</strong> berdedikasi menciptakan nilai tambah berkesinambungan melalui profesionalisme kerja, pemanfaatan armada modern, dan kepatuhan penuh terhadap standar keselamatan kerja serta lingkungan.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Core Value 1: Safety & Health */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 shadow-xs hover:border-sky-300 hover:bg-white hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 font-bold mb-4">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">Safety & K3L Utama</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Keselamatan dan kesehatan kerja tanpa kompromi demi tercapainya target Zero Incident dan kelestarian lingkungan kerja tambang.
              </p>
            </div>

            {/* Core Value 2: Integrity & Accountability */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 shadow-xs hover:border-sky-300 hover:bg-white hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold mb-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">Integritas & Akuntabilitas</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Menjunjung tinggi transparansi, kejujuran data, dan tanggung jawab profesional dalam setiap pencapaian kinerja individu maupun tim.
              </p>
            </div>

            {/* Core Value 3: Operational Excellence */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 shadow-xs hover:border-sky-300 hover:bg-white hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600 font-bold mb-4">
                <svg className="w-6 h-6 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">Keunggulan Operasional</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Eksekusi operasional yang presisi, efisiensi konsumsi bahan bakar, kesiapan alat optimal, dan ketepatan pemenuhan jadwal produksi.
              </p>
            </div>

            {/* Core Value 4: Continuous Improvement */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 shadow-xs hover:border-sky-300 hover:bg-white hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600 font-bold mb-4">
                <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">Inovasi Berkelanjutan</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Terus berkembang melalui digitalisasi proses evaluasi kinerja, peningkatan kompetensi talenta, dan perbaikan berkelanjutan.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pilar Evaluasi Kinerja KPI GPE */}
      <section id="pilar-kinerja" className="py-20 bg-slate-50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
              Pilar Kinerja GPE
            </span>
            <h2 className="mt-3 text-3xl font-black text-slate-900">
              Fokus Penilaian Kinerja Karyawan
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              Kerangka evaluasi terstandarisasi yang dirancang untuk mengukur kontribusi nyata setiap karyawan terhadap target strategis perusahaan.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Pilar 1: Operasional & Produksi */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-sky-400 hover:shadow-lg transition">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-700 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200">
                  Pilar 1
                </span>
                <span className="text-xs text-slate-400 font-medium">Core Operations</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Operasional & Produksi
              </h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Pencapaian target fisik bulanan, kesiapan mekanis (mechanical availability), utilisasi armada, dan ketepatan alur kerja operasional.
              </p>
            </div>

            {/* Pilar 2: HSE & Keselamatan Kerja */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-emerald-400 hover:shadow-lg transition">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  Pilar 2
                </span>
                <span className="text-xs text-slate-400 font-medium">Safety First</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                K3L & Keselamatan Kerja
              </h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Penerapan disiplin Golden Rules keselamatan tambang, kepatuhan inspeksi K3L, mitigasi risiko bahaya, dan kelestarian lingkungan.
              </p>
            </div>

            {/* Pilar 3: Efisiensi Biaya */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-blue-400 hover:shadow-lg transition">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                  Pilar 3
                </span>
                <span className="text-xs text-slate-400 font-medium">Cost Control</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Efisiensi & Pengendalian Biaya
              </h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Optimasi penggunaan bahan bakar (fuel ratio), pemeliharaan suku cadang efisien, serta kepatuhan anggaran proyek secara ketat.
              </p>
            </div>

            {/* Pilar 4: Disiplin & SDM */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-purple-400 hover:shadow-lg transition">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-1 rounded-md border border-purple-200">
                  Pilar 4
                </span>
                <span className="text-xs text-slate-400 font-medium">People & Culture</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Disiplin & Pengembangan SDM
              </h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Tingkat kehadiran, ketepatan waktu kerja, kerja sama lintas fungsi, kepemimpinan tim, dan komitmen pengembangan kapabilitas diri.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Keunggulan Sistem KPI Section */}
      <section id="keunggulan" className="py-20 bg-white border-t border-slate-200">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-700 bg-sky-50 px-3 py-1 rounded-full border border-sky-200">
              Keunggulan Sistem Digital
            </span>
            <h2 className="mt-3 text-3xl font-black text-slate-900">
              Evaluasi Kinerja yang Akurat & Terpercaya
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              Menggantikan pencatatan manual dengan platform digital modern yang transparan, presisi, dan dapat dipertanggungjawabkan.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-xs hover:border-sky-300 hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600 font-bold mb-4">
                <svg className="w-6 h-6 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">Input 12 Bulan Fleksibel</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Pencatatan target tahunan dan realisasi bulanan Jan–Des dengan kalkulasi otomatis (SUM, AVG, LAST_VALUE) sesuai karakteristik indikator KPI.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-xs hover:border-blue-300 hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold mb-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">Auto-Fill Bukti Excel</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Tautkan file spreadsheet Excel pendukung. Sistem secara otomatis mengekstrak data capaian langsung ke dalam kolom formulir penilaian.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-xs hover:border-indigo-300 hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold mb-4">
                <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">Audit & Penilaian Terstandarisasi</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Penetapan skor akhir berbasis matriks baku korporat yang terekam dalam log audit transparan demi keadilan dan apresiasi kinerja karyawan.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-sky-500 via-blue-600 to-indigo-600 text-white font-black text-xs">
              GPE
            </div>
            <span className="font-bold text-slate-800">PT GRAHA PRIMA ENERGY</span>
            <span className="text-slate-300">·</span>
            <span>Performance Management System</span>
          </div>
          <div>© {new Date().getFullYear()} PT Graha Prima Energy (GPE). Seluruh Hak Cipta Dilindungi.</div>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* MODAL LOGIN SATU PINTU DI DEPAN (INSTAN TANPA RENDER DELAY ATAU 404)       */}
      {/* ========================================================================= */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden scale-in-95 duration-150">
            {/* Modal Header */}
            <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {loginStep === "CHANGE_PASSWORD" ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 shrink-0 font-bold text-sm">
                    KPI
                  </div>
                )}
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {loginStep === "CHANGE_PASSWORD" ? "Ubah Kata Sandi Wajib" : "Login Portal KPI"}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {loginStep === "CHANGE_PASSWORD"
                      ? `Akun: ${loggedInUser?.name || "Karyawan"} (${loggedInUser?.nik})`
                      : "Masukkan NIK resmi perusahaan Anda"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseLogin}
                disabled={isPending}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {loginStep === "CHANGE_PASSWORD" && (
                <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 leading-relaxed">
                  <span className="font-bold">Perhatian:</span> Ini adalah login pertama Anda atau kata sandi Anda baru saja di-reset oleh HR. Demi keamanan akun, Anda <b>wajib menentukan kata sandi baru</b> sebelum melanjutkan ke dashboard.
                </div>
              )}

              {errorMessage && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 flex items-center gap-2">
                  <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{errorMessage}</span>
                </div>
              )}

              {loginStep === "LOGIN" ? (
                <form onSubmit={handleFormSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Nomor Induk Karyawan (NIK)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        value={nik}
                        onChange={(e) => setNik(e.target.value)}
                        placeholder="Contoh: 1.1025.273 atau 10010"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-900 placeholder-slate-400 shadow-2xs focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-400 font-mono transition"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Kata Sandi / PIN
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </span>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Default NIK atau kata sandi..."
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-10 text-sm font-semibold text-slate-900 placeholder-slate-400 shadow-2xs focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-400 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition p-0.5 rounded cursor-pointer"
                        tabIndex={-1}
                        aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full rounded-lg bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 hover:from-sky-600 hover:to-blue-700 py-2.5 px-4 text-xs font-bold text-white shadow-sm shadow-sky-600/20 transition active:scale-98 disabled:opacity-60 cursor-pointer"
                  >
                    {isPending ? "Memverifikasi NIK..." : "Login"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
                  {/* Field 1: Default NIK Karyawan (Readonly / Default) */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Nomor Induk Karyawan (NIK)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        value={loggedInUser?.nik || nik}
                        disabled
                        readOnly
                        className="w-full rounded-xl border border-slate-200 bg-slate-100 py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-600 shadow-2xs font-mono cursor-not-allowed select-none"
                      />
                    </div>
                  </div>

                  {/* Field 2: Langsung Kata Sandi Baru */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Kata Sandi Baru
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </span>
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimal 4 karakter"
                        autoComplete="new-password"
                        className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-10 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-400 shadow-2xs transition"
                        autoFocus
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition p-0.5 rounded cursor-pointer"
                        tabIndex={-1}
                        aria-label={showNewPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full rounded-lg bg-orange-500 hover:bg-orange-600 py-2.5 px-4 text-xs font-bold text-white shadow-sm shadow-orange-500/20 transition active:scale-98 disabled:opacity-60 cursor-pointer"
                  >
                    {isPending ? "Menyimpan..." : "Login"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
