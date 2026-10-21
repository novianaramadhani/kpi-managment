"use client";

import React, { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginWithNik, changeUserPasswordAction, type UserSession } from "@/lib/auth";
import Swal from "sweetalert2";

export default function LoginPage() {
  const router = useRouter();
  const [loginStep, setLoginStep] = useState<"LOGIN" | "CHANGE_PASSWORD">("LOGIN");
  const [loggedInUser, setLoggedInUser] = useState<UserSession | null>(null);

  const [nik, setNik] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  // Prefetch dashboard di background saat halaman login dimuat
  useEffect(() => {
    router.prefetch("/dashboard");
  }, [router]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!nik.trim()) {
      setErrorMessage("Silakan masukkan Nomor Induk Karyawan (NIK) Anda.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await loginWithNik(nik, password);
        if (res.success && res.session) {
          if (res.session.mustChangePassword) {
            setLoggedInUser(res.session);
            setLoginStep("CHANGE_PASSWORD");
            setErrorMessage("");
            return;
          }

          void Swal.fire({
            icon: "success",
            title: `Selamat Datang, ${res.session.name}!`,
            text: `Anda berhasil masuk sebagai ${res.session.role}. Membuka dashboard...`,
            timer: 1000,
            showConfirmButton: false,
          });

          // Navigasi cepat via SPA client-side
          router.push("/dashboard");
          router.refresh();
        } else {
          setErrorMessage(res.error || "Gagal masuk. Silakan periksa kembali NIK Anda.");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat login";
        setErrorMessage(msg);
      }
    });
  };

  const handleChangePassword = (e: React.FormEvent) => {
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
            timer: 1200,
            showConfirmButton: false,
          });

          router.push("/dashboard");
          router.refresh();
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-sky-50/30 to-slate-100 flex flex-col justify-between text-slate-800">
      {/* Top Navbar */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md px-6 py-3.5 shadow-2xs">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-400 to-blue-500 text-white font-black text-xs shadow-sm shadow-sky-500/20">
              KPI
            </div>
            <div>
              <span className="font-black tracking-wide text-slate-900 text-sm block leading-none">KPI SYSTEM</span>
              <span className="block text-[10px] text-sky-600 font-bold uppercase tracking-wider mt-0.5">Performance Management</span>
            </div>
          </Link>
        </div>
      </header>

      {/* Main Login Card (Clean Light Theme) */}
      <div className="mx-auto w-full max-w-lg px-6 py-8">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {/* Card Header */}
          <div className="border-b border-slate-100 bg-slate-50/70 p-6 text-center">
            {loginStep === "CHANGE_PASSWORD" ? (
              <>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 mb-3 border border-amber-200">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-xl font-black text-slate-900">Ubah Kata Sandi Wajib</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Akun: {loggedInUser?.name} (NIK: {loggedInUser?.nik})
                </p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-black text-slate-900">Login Portal KPI</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Gunakan Nomor Induk Karyawan (NIK) resmi perusahaan Anda
                </p>
              </>
            )}
          </div>

          {/* Form Area */}
          <div className="p-6">
            {loginStep === "CHANGE_PASSWORD" && (
              <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 leading-relaxed">
                <span className="font-bold">Perhatian:</span> Ini adalah login pertama Anda atau kata sandi Anda baru saja direset oleh HR. Anda <b>wajib menentukan kata sandi baru</b> sebelum dapat mengakses Dashboard.
              </div>
            )}

            {errorMessage && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            {loginStep === "LOGIN" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Nomor Induk Karyawan (NIK)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
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
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
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
              <form onSubmit={handleChangePassword} className="space-y-4">
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

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} KPI SYSTEM · Performance Management System
      </footer>
    </div>
  );
}
