"use client";

import React, { useState, useTransition } from "react";
import { loginWithNik, changeUserPasswordAction, logoutUser, type UserSession } from "@/lib/auth";
import Swal from "sweetalert2";

interface PortalPageClientProps {
  currentUser: UserSession | null;
  activePeriod: {
    name: string;
    evaluationDate: string;
  } | null;
  empCount: number;
  depCount: number;
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
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

    if (!newPassword.trim()) {
      setErrorMessage("Kata sandi baru tidak boleh kosong.");
      return;
    }
    if (newPassword.length < 4) {
      setErrorMessage("Kata sandi baru minimal harus 4 karakter.");
      return;
    }
    if (newPassword === loggedInUser?.nik) {
      setErrorMessage("Kata sandi baru tidak boleh sama dengan NIK Anda.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await changeUserPasswordAction(newPassword);
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
        setErrorMessage(msg);
      }
    });
  };


  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-sky-500 selection:text-white">
      {/* Top Navigation Bar (Clean Light Theme) */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-400 to-blue-500 font-black text-white text-xs shadow-sm shadow-sky-500/20">
              KPI
            </div>
            <div>
              <span className="font-black tracking-wider text-slate-900 text-sm block leading-none">KPI SYSTEM</span>
              <span className="block text-[10px] text-sky-600 font-bold uppercase tracking-wider mt-0.5">Performance Management</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#fitur" className="hover:text-sky-600 transition">Fitur Utama</a>
            <a href="#alur" className="hover:text-sky-600 transition">Alur Approval</a>
            <a href="#sites" className="hover:text-sky-600 transition">Operating Units</a>
          </nav>
        </div>
      </header>

      {/* Hero Section (Soft Light Blue Concept) */}
      <section className="relative overflow-hidden bg-gradient-to-b from-sky-50/60 via-white to-slate-50 pt-16 pb-20 md:pt-24 md:pb-28">
        {/* Soft Ambient Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[350px] bg-sky-200/30 blur-[120px] rounded-full pointer-events-none" />

        <div className="mx-auto max-w-5xl px-6 text-center relative z-10">
          {/* Active Period Pill */}
          {activePeriod && (
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50/80 px-4 py-1.5 text-xs font-semibold text-sky-800 shadow-2xs mb-8">
              <span className="flex h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
              <span>Periode Berjalan: <b>{activePeriod.name}</b></span>
              <span className="text-sky-300">·</span>
              <span className="text-slate-500">Cut-off: {activePeriod.evaluationDate}</span>
            </div>
          )}

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-slate-900 leading-tight">
            Sistem Evaluasi Kinerja &{" "}
            <span className="bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 bg-clip-text text-transparent">
              KPI Karyawan Terpadu
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Platform evaluasi kinerja karyawan untuk penetapan target tahunan, input realisasi bulanan, auto-fill bukti Excel, dan alur persetujuan bertingkat yang transparan per departemen.
          </p>

          {/* Action CTA Buttons */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={handleOpenLogin}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 hover:from-sky-600 hover:to-blue-700 px-7 py-3.5 text-sm font-bold text-white shadow-md shadow-sky-600/20 transition transform hover:-translate-y-0.5 cursor-pointer active:scale-98"
            >
              <span>Login</span>
              <span>→</span>
            </button>
          </div>

          {/* Realtime Stats Bar (Light Cards) */}
          <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
            <div className="p-2">
              <div className="text-3xl font-black text-slate-900">{empCount}</div>
              <div className="text-xs text-slate-500 mt-1 font-medium">Karyawan Terdaftar</div>
            </div>
            <div className="p-2 border-l border-slate-200">
              <div className="text-3xl font-black text-slate-900">{depCount}</div>
              <div className="text-xs text-slate-500 mt-1 font-medium">Departemen Operasional</div>
            </div>
            <div className="p-2 border-l border-slate-200">
              <div className="text-3xl font-black text-blue-700">3 Sites</div>
              <div className="text-xs text-slate-500 mt-1 font-medium">GAM, AKP & Head Office</div>
            </div>
            <div className="p-2 border-l border-slate-200">
              <div className="text-3xl font-black text-sky-600">100%</div>
              <div className="text-xs text-slate-500 mt-1 font-medium">Otomasi Scoring Matrix</div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights Section */}
      <section id="fitur" className="py-20 bg-white border-y border-slate-200">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              Keunggulan Sistem
            </span>
            <h2 className="mt-3 text-3xl font-black text-slate-900">
              Solusi Efisiensi Manajemen Kinerja Terintegrasi
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              Menggantikan form manual dengan alur digital berstandar korporasi, akurat, dan dapat diaudit setiap saat.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-xs hover:border-sky-300 hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600 text-2xl font-bold mb-4">
                <svg className="w-6 h-6 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">Input 12 Bulan Fleksibel</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Pengisian target tahunan dan realisasi bulanan Jan–Des dengan perhitungan otomatis (SUM, AVG, atau LAST_VALUE) sesuai karakteristik KPI.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-xs hover:border-emerald-300 hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-800 text-2xl font-bold mb-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">Auto-Fill Bukti Excel</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Tautkan file spreadsheet Excel pendukung. Sistem secara otomatis mengekstrak data capaian langsung ke dalam kolom formulir penilaian.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-xs hover:border-emerald-300 hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-800 text-2xl font-bold mb-4">
                <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">Alur Approval Bertingkat</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Verifikasi berjenjang dari Penilai (Supervisor) ke Head Department dengan validasi kelengkapan data sebelum finalisasi hasil.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Operating Units Section */}
      <section id="sites" className="py-20 bg-slate-50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
              Cakupan Operasional
            </span>
            <h2 className="mt-3 text-3xl font-black text-slate-900">
              Unit Operasional & Wilayah Kerja
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              Mendukung klasifikasi form KPI khusus sesuai karakteristik area operasional lapangan dan kantor pusat.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Site GAM */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-emerald-500 hover:shadow-lg transition group">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  Site GAM
                </span>
                <span className="text-xs text-slate-500">Operasional Tambang Batubara</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-700 transition">
                PT Ganda Alam Makmur (GAM)
              </h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Perusahaan pertambangan batu bara yang berlokasi di Kalimantan Timur (afiliasi LX International Corp). Fokus pada keselamatan kerja (HSE), efisiensi produksi batubara, dan pemeliharaan alat berat operasional.
              </p>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>Departemen Terkait</span>
                <span className="text-slate-800">Production, HSE, Eng</span>
              </div>
            </div>

            {/* Site AKP */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-blue-500 hover:shadow-lg transition group">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                  Site AKP
                </span>
                <span className="text-xs text-slate-500">Operasional Tambang Nikel</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-700 transition">
                PT Adhi Kartiko Pratama Tbk (AKP)
              </h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Perusahaan pertambangan nikel di Konawe Utara, Sulawesi Tenggara. Fokus pada eksplorasi & penambangan bijih nikel laterit, efisiensi rantai pasok, manajemen pelabuhan (port/jetty), barging, dan ketepatan pengiriman.
              </p>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>Departemen Terkait</span>
                <span className="text-slate-800">Mining Ops, Port, Supply Chain</span>
              </div>
            </div>

            {/* Head Office */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-purple-500 hover:shadow-lg transition group">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-1 rounded-md border border-purple-200">
                  Head Office (HO)
                </span>
                <span className="text-xs text-slate-500">Kantor Pusat (Samarinda)</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-700 transition">
                Head Office Samarinda
              </h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Pusat manajemen dan koordinasi korporasi di Samarinda, Kalimantan Timur. Fokus pada perencanaan strategis, keuangan & akuntansi, SDM (HRGA), TI, legal, dan tata kelola operasional terpadu.
              </p>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>Departemen Terkait</span>
                <span className="text-slate-800">HRGA, Finance, IT, Admin</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500 text-white font-black text-xs">
              KPI
            </div>
            <span className="font-bold text-slate-800">KPI Management System</span>
          </div>
          <div>© {new Date().getFullYear()} KPI SYSTEM · Hak Cipta Dilindungi.</div>
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
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Default NIK atau kata sandi..."
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-900 placeholder-slate-400 shadow-2xs focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-400 transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 hover:from-sky-600 hover:to-blue-700 py-3 text-sm font-bold text-white shadow-md shadow-sky-600/20 transition active:scale-98 disabled:opacity-60 cursor-pointer"
                  >
                    {isPending ? "Memverifikasi NIK..." : "Masuk ke Sistem KPI →"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Kata Sandi Baru
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimal 4 karakter"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-400 shadow-2xs"
                      autoFocus
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Konfirmasi Kata Sandi Baru
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ulangi kata sandi baru"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-400 shadow-2xs"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 hover:from-sky-600 hover:to-blue-700 py-3 text-sm font-bold text-white shadow-md shadow-sky-600/20 transition active:scale-98 disabled:opacity-60 cursor-pointer"
                  >
                    {isPending ? "Menyimpan kata sandi..." : "Simpan Kata Sandi & Masuk Dashboard →"}
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
