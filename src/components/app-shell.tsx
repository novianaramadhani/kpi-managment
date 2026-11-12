"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { UserSession, RoleType, UserProfileDetail } from "@/lib/auth";
import { logoutUser, changeUserPasswordAction, getCurrentUserProfileDetailAction } from "@/lib/auth";
import { getRoleBadgeInfo } from "@/lib/role-badge";
import Swal from "sweetalert2";
import {
  KpiGuidedTour,
  fetchUserOnboardingStatus,
  saveUserOnboardingStatus,
} from "@/components/kpi-guided-tour";

interface AppShellProps {
  children: React.ReactNode;
  initialUser: UserSession | null;
}

export function AppShell({ children, initialUser }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserSession | null>(initialUser);

  // Burger Menu State: Desktop Collapsible & Mobile Drawer (Default: collapsed)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Dynamic greeting & live clock state
  const [currentTime, setCurrentTime] = useState<string>("");
  const [greeting, setGreeting] = useState<string>("Selamat Datang");

  // Mandatory password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changePassError, setChangePassError] = useState("");
  const [isSubmittingPass, setIsSubmittingPass] = useState(false);

  // Profile Popover & Detail State
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileDetail, setProfileDetail] = useState<UserProfileDetail | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const mobileProfileMenuRef = useRef<HTMLDivElement>(null);

  // Voluntary Password Modal State (via Profile Popover)
  const [isVoluntaryPassModalOpen, setIsVoluntaryPassModalOpen] = useState(false);
  const [voluntaryNewPass, setVoluntaryNewPass] = useState("");
  const [voluntaryConfirmPass, setVoluntaryConfirmPass] = useState("");
  const [voluntaryPassError, setVoluntaryPassError] = useState("");
  const [isSubmittingVoluntaryPass, setIsSubmittingVoluntaryPass] = useState(false);

  // User Guidelines / Contextual Guided Tour State
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(1);
  const onboardingCheckedRef = useRef<string | null>(null);

  // Check onboarding status once per authenticated user session (First Login Auto-Trigger)
  useEffect(() => {
    if (!currentUser || !currentUser.nik || currentUser.mustChangePassword) return;
    if (pathname === "/" || pathname === "/login") return;

    // If tour was actively open before a hard navigation in the same browser session, restore it
    const activeSessionTour =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem(`kpi_tour_open_${currentUser.nik}`)
        : null;
    if (activeSessionTour) {
      const savedStep = Number(activeSessionTour) || 1;
      setTourStep(savedStep);
      setIsTourOpen(true);
      onboardingCheckedRef.current = currentUser.nik;
      return;
    }

    if (onboardingCheckedRef.current === currentUser.nik) return;
    onboardingCheckedRef.current = currentUser.nik;

    let cancelled = false;
    fetchUserOnboardingStatus(currentUser.nik).then((res) => {
      if (cancelled) return;
      if (res.status === "NOT_STARTED") {
        setTourStep(1);
        setIsTourOpen(true);
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(`kpi_tour_open_${currentUser.nik}`, "1");
        }
        void saveUserOnboardingStatus(currentUser.nik, "IN_PROGRESS", 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentUser, pathname]);

  const handleOpenGuidelines = () => {
    setIsProfileOpen(false);
    setIsMobileMenuOpen(false);
    setIsSidebarOpen(true);
    setTourStep(1);
    setIsTourOpen(true);
    if (currentUser?.nik) {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(`kpi_tour_open_${currentUser.nik}`, "1");
      }
      void saveUserOnboardingStatus(currentUser.nik, "IN_PROGRESS", 1);
    }
  };

  const handleTourStepChange = (nextStep: number) => {
    setTourStep(nextStep);
    if (nextStep === 1) {
      setIsSidebarOpen(true);
    }
    if (currentUser?.nik) {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          `kpi_tour_open_${currentUser.nik}`,
          String(nextStep)
        );
      }
      void saveUserOnboardingStatus(currentUser.nik, "IN_PROGRESS", nextStep);
    }
  };

  const handleTourSkip = () => {
    setIsTourOpen(false);
    if (currentUser?.nik) {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(`kpi_tour_open_${currentUser.nik}`);
      }
      void saveUserOnboardingStatus(currentUser.nik, "SKIPPED", tourStep);
    }
  };

  const handleTourClose = () => {
    setIsTourOpen(false);
    if (currentUser?.nik) {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(`kpi_tour_open_${currentUser.nik}`);
      }
      void saveUserOnboardingStatus(currentUser.nik, "SKIPPED", tourStep);
    }
  };

  const handleTourFinish = () => {
    setIsTourOpen(false);
    if (currentUser?.nik) {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(`kpi_tour_open_${currentUser.nik}`);
      }
      void saveUserOnboardingStatus(currentUser.nik, "COMPLETED", 6);
    }
  };

  // Close profile on route change
  useEffect(() => {
    setIsProfileOpen(false);
  }, [pathname]);

  // Click outside & Escape key listeners for profile popup
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(target) &&
        mobileProfileMenuRef.current &&
        !mobileProfileMenuRef.current.contains(target)
      ) {
        setIsProfileOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProfileOpen(false);
      }
    };

    if (isProfileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProfileOpen]);

  // Fetch full employee profile details when popup opens
  useEffect(() => {
    if (isProfileOpen && !profileDetail && currentUser) {
      setIsLoadingProfile(true);
      getCurrentUserProfileDetailAction()
        .then((res) => {
          if (res) setProfileDetail(res);
        })
        .finally(() => setIsLoadingProfile(false));
    }
  }, [isProfileOpen, profileDetail, currentUser]);

  const handleVoluntaryPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVoluntaryPassError("");

    if (!voluntaryNewPass.trim()) {
      setVoluntaryPassError("Kata sandi baru tidak boleh kosong.");
      return;
    }
    if (voluntaryNewPass.length < 4) {
      setVoluntaryPassError("Kata sandi minimal harus 4 karakter.");
      return;
    }
    if (voluntaryNewPass === currentUser?.nik) {
      setVoluntaryPassError("Kata sandi baru tidak boleh sama dengan NIK Anda.");
      return;
    }
    if (voluntaryNewPass !== voluntaryConfirmPass) {
      setVoluntaryPassError("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setIsSubmittingVoluntaryPass(true);
    try {
      const res = await changeUserPasswordAction(voluntaryNewPass);
      if (res.success) {
        setIsVoluntaryPassModalOpen(false);
        setVoluntaryNewPass("");
        setVoluntaryConfirmPass("");
        await Swal.fire({
          icon: "success",
          title: "Kata Sandi Berhasil Diperbarui!",
          text: "Kata sandi akun Anda telah berhasil diperbarui.",
          timer: 2000,
          showConfirmButton: false,
        });
      } else {
        setVoluntaryPassError(res.error || "Gagal memperbarui kata sandi.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      setVoluntaryPassError(msg);
    } finally {
      setIsSubmittingVoluntaryPass(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePassError("");

    if (!newPassword.trim()) {
      setChangePassError("Kata sandi baru tidak boleh kosong.");
      return;
    }

    if (newPassword.length < 4) {
      setChangePassError("Kata sandi minimal harus 4 karakter.");
      return;
    }

    if (newPassword === currentUser?.nik) {
      setChangePassError("Kata sandi baru tidak boleh sama dengan NIK Anda.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setChangePassError("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setIsSubmittingPass(true);
    try {
      const res = await changeUserPasswordAction(newPassword);
      if (res.success) {
        await Swal.fire({
          icon: "success",
          title: "Kata Sandi Berhasil Diperbarui!",
          text: "Akun Anda telah diamankan. Selamat bekerja di Sistem KPI!",
          timer: 2000,
          showConfirmButton: false,
        });
        if (currentUser) {
          setCurrentUser({ ...currentUser, mustChangePassword: false });
        }
      } else {
        setChangePassError(res.error || "Gagal memperbarui kata sandi.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      setChangePassError(msg);
    } finally {
      setIsSubmittingPass(false);
    }
  };

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    setCurrentUser(initialUser);
  }, [initialUser]);

  useEffect(() => {
    const updateGreetingAndClock = () => {
      const now = new Date();

      // TimeZone WITA (Asia/Makassar, UTC+8)
      const timeStr = now.toLocaleTimeString("id-ID", {
        timeZone: "Asia/Makassar",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const dateStr = now.toLocaleDateString("id-ID", {
        timeZone: "Asia/Makassar",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      // Ambil jam dalam zona WITA untuk kalkulasi greeting yang akurat
      const hourFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Makassar",
        hour: "numeric",
        hour12: false,
      });
      const hours = parseInt(hourFormatter.format(now), 10);

      let g = "Selamat Pagi";
      if (hours >= 11 && hours < 16) {
        g = "Selamat Siang";
      } else if (hours >= 16 && hours < 19) {
        g = "Selamat Sore";
      } else if (hours >= 19 || hours < 4) {
        g = "Selamat Malam";
      }
      setGreeting(g);

      setCurrentTime(`${dateStr} · ${timeStr} WITA`);
    };

    updateGreetingAndClock();
    const timer = setInterval(updateGreetingAndClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setCurrentUser(null);
    try {
      document.cookie = "kpi_user_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    // Navigasi relatif di browser ke portal page (/) agar tetap di domain aktif
    window.location.href = "/";
  };

  // Jika di Landing Page ("/") atau Login Page ("/login"), render full screen tanpa sidebar internal
  const isPublicPage = pathname === "/" || pathname === "/login";

  if (isPublicPage) {
    return <main className="min-h-screen bg-slate-50 text-slate-900">{children}</main>;
  }

  // Jika user belum mengubah kata sandi default/reset, JANGAN tampilkan dashboard / sidebar / data kinerja sama sekali!
  // Tampilkan antarmuka aman pra-dashboard berlatar belakang Landing Page Portal yang bersih dan elegan.
  if (currentUser?.mustChangePassword) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50/60 via-white to-slate-50 text-slate-900 flex flex-col justify-between relative selection:bg-sky-500 selection:text-white">
        {/* Ambient Soft Glow khas Landing Page */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[350px] bg-sky-200/30 blur-[120px] rounded-full pointer-events-none" />

        {/* Top Header Portal Minimal */}
        <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md px-6 py-4 relative z-10 shadow-2xs">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-400 to-blue-500 font-black text-white text-xs shadow-sm shadow-sky-500/20">
                KPI
              </div>
              <div>
                <span className="font-black tracking-wider text-slate-900 text-sm block">KPI SYSTEM</span>
                <span className="block text-[11px] text-sky-600 font-semibold">Performance Portal</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs font-bold text-rose-600 hover:text-rose-700 border border-rose-200 rounded-xl px-3 py-1.5 hover:bg-rose-50 transition cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Batal / Log Out</span>
            </button>
          </div>
        </header>

        {/* Main Ubah Kata Sandi Card (Center Screen) */}
        <main className="mx-auto w-full max-w-md px-6 py-12 relative z-10 flex-1 flex items-center justify-center">
          <div className="w-full rounded-2xl bg-white p-7 md:p-8 shadow-xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3.5 mb-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 shrink-0 shadow-2xs">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Ubah Kata Sandi Wajib</h3>
                <p className="text-xs text-slate-500">
                  Akun: <span className="font-bold text-slate-700">{currentUser.name}</span> (NIK: {currentUser.nik})
                </p>
              </div>
            </div>

            <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200/80 p-3.5 text-xs text-amber-900 leading-relaxed">
              <span className="font-bold">Perhatian:</span> Ini adalah login pertama Anda atau kata sandi Anda baru saja di-reset oleh HR. Anda <b>wajib membuat kata sandi baru</b> sebelum dapat mengakses dashboard KPI.
            </div>

            {changePassError && (
              <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700 flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{changePassError}</span>
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Kata Sandi Baru
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 4 karakter"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-400 shadow-2xs transition"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Konfirmasi Kata Sandi Baru
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi kata sandi baru"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-400 shadow-2xs transition"
                  required
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingPass}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white py-3 text-sm font-bold shadow-md shadow-sky-600/20 transition cursor-pointer disabled:opacity-50 active:scale-98"
                >
                  {isSubmittingPass ? (
                    <span>Menyimpan...</span>
                  ) : (
                    <span>Simpan Kata Sandi & Masuk Dashboard →</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </main>

        <footer className="border-t border-slate-200/80 bg-white/70 py-4 text-center text-xs text-slate-500">
          Sistem Penilaian KPI Karyawan Terpadu © {new Date().getFullYear()}
        </footer>
      </div>
    );
  }

  // Role aktif (default ADMIN jika belum login di demo)
  const role: RoleType = currentUser?.role || "ADMIN";

  interface NavItem {
    href: string;
    label: string;
    roles: RoleType[];
    icon: React.ReactNode;
  }

  const allNavItems: NavItem[] = [
    {
      href: "/dashboard",
      label: "Dashboard",
      roles: ["ADMIN", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
    },
    {
      href: "/admin",
      label: "Admin Menu",
      roles: ["ADMIN"],
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      href: "/setup/kpi-config",
      label: "KPI Configuration",
      roles: ["ADMIN"],
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
      ),
    },
    {
      href: "/setup/templates",
      label: "Template KPI",
      roles: ["ADMIN"],
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
      ),
    },
    {
      href: "/input-kpi",
      label: "Penilaian KPI",
      roles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
    {
      href: "/report",
      label: "Report & Export",
      roles: ["ADMIN", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  const visibleNav = allNavItems.filter((item) => item.roles.includes(role));

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    const [baseHref] = href.split("?");
    return pathname === baseHref || pathname.startsWith(baseHref + "/");
  };

  const userInitials = (currentUser?.name || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  const { badgeClass: roleBadgeClass, label: roleBadgeLabel } = getRoleBadgeInfo(role);

  const renderProfilePopoverContent = () => (
    <>
      {/* Header: Avatar, Nama, Role, Status & NIK */}
      <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white font-black text-sm shadow-xs ring-2 ring-white">
          <span>{userInitials}</span>
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="font-bold text-sm text-slate-900 truncate max-w-[150px]" title={currentUser?.name}>
              {currentUser?.name}
            </h4>
            <span className={`text-[10px] px-2 py-0.5 rounded-md border shrink-0 ${roleBadgeClass}`}>
              {roleBadgeLabel}
            </span>
          </div>
          <div className="text-[11px] text-slate-600 font-medium truncate mt-0.5" title={profileDetail?.jobPosition || currentUser?.jobPosition}>
            {profileDetail?.jobPosition || currentUser?.jobPosition || "Karyawan"}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-mono">
            <span>NIK: {currentUser?.nik}</span>
            <span>•</span>
            <span className="text-emerald-700 font-semibold font-sans flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Aktif
            </span>
          </div>
        </div>
      </div>

      {/* Informasi Kepegawaian (Clean 2-Column Grid) */}
      <div className="py-3 border-b border-slate-100">
        <div className="bg-slate-50/70 rounded-xl p-2.5 border border-slate-100 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block font-medium">Job Level</span>
            <span className="font-semibold text-slate-800 text-[11px] block truncate">
              {isLoadingProfile ? "..." : profileDetail?.jobLevelName || "-"}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block font-medium">Departemen</span>
            <span className="font-semibold text-slate-800 text-[11px] block truncate" title={profileDetail?.departmentName || currentUser?.departmentName}>
              {profileDetail?.departmentName || currentUser?.departmentName || "-"}
            </span>
          </div>
          <div className="col-span-2 pt-1 border-t border-slate-200/50 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-medium">Operating Unit (OU)</span>
            <span className="font-semibold text-slate-800 text-[11px]">
              {profileDetail?.operatingUnit || currentUser?.operatingUnit || "HO"}
            </span>
          </div>
        </div>
      </div>

      {/* Hierarki Approval */}
      <div className="py-2.5 border-b border-slate-100">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
          Hierarki Persetujuan
        </span>
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-slate-400 shrink-0">Penilai:</span>
            <span className="font-medium text-slate-800 truncate text-right ml-2" title={profileDetail?.appraiserName || "Atasan Langsung"}>
              {isLoadingProfile ? "..." : profileDetail?.appraiserName || "Atasan Langsung"}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-slate-400 shrink-0">Head Dept:</span>
            <span className="font-medium text-slate-800 truncate text-right ml-2" title={profileDetail?.headDeptName || "Head Dept"}>
              {isLoadingProfile ? "..." : profileDetail?.headDeptName || "Head Dept"}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-slate-400 shrink-0">Manager:</span>
            <span className="font-medium text-slate-800 truncate text-right ml-2" title={profileDetail?.managerName || "Manager Divisi"}>
              {isLoadingProfile ? "..." : profileDetail?.managerName || "Manager Divisi"}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="pt-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setIsProfileOpen(false);
            setIsVoluntaryPassModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 transition cursor-pointer border border-transparent hover:border-slate-200"
        >
          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>Ubah Sandi</span>
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 border border-rose-200/80 rounded-lg px-3 py-1.5 transition cursor-pointer active:scale-95"
        >
          <svg className="w-3.5 h-3.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>Log Out</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 antialiased overflow-x-hidden max-w-full">
      {/* Sidebar Desktop (Clean Modern Enterprise) */}
      <aside
        className={`hidden md:flex flex-col shrink-0 bg-white border-r border-slate-200 text-slate-800 shadow-2xs z-20 sticky top-0 h-screen transition-all duration-300 ease-in-out ${
          isSidebarOpen ? "w-64" : "w-[72px]"
        }`}
      >
        {/* Brand Logo Header: Clean, Integrated */}
        {isSidebarOpen ? (
          <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
            <Link href="/dashboard" className="flex items-center gap-2.5 group overflow-hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-xs shadow-2xs group-hover:bg-blue-700 transition shrink-0">
                KPI
              </div>
              <div className="overflow-hidden whitespace-nowrap">
                <div className="text-xs font-bold tracking-wider text-slate-900">KPI SYSTEM</div>
                <div className="text-[10px] font-medium text-slate-400">Enterprise Performance</div>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95 transition cursor-pointer shrink-0"
              title="Kecilkan Menu Sidebar"
              aria-label="Kecilkan Menu Sidebar"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="h-16 border-b border-slate-200 flex items-center justify-center shrink-0 bg-white">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="group flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs active:scale-95 transition cursor-pointer"
              title="Buka Menu Sidebar (Klik untuk expand)"
              aria-label="Buka Menu Sidebar"
            >
              <span className="group-hover:hidden tracking-wider font-bold">KPI</span>
              <svg className="h-4 w-4 hidden group-hover:block transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        )}

        {/* Navigation Items (Clean Flat List) */}
        <nav
          data-tour="sidebar-nav-container"
          className={`flex-1 overflow-y-auto py-3 space-y-1 ${isSidebarOpen ? "px-3" : "px-2"}`}
        >
          {visibleNav.map((l) => {
            const active = isActive(l.href);
            const tourAttr = `nav-${l.href.replace(/[^a-z0-9]/gi, "-")}`;
            if (!isSidebarOpen) {
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  data-tour={tourAttr}
                  title={l.label}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl mx-auto transition-all cursor-pointer ${
                    active
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="shrink-0">{l.icon}</span>
                </Link>
              );
            }

            return (
              <Link
                key={l.href}
                href={l.href}
                data-tour={tourAttr}
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-all group ${
                  active
                    ? "bg-blue-600 text-white shadow-xs font-semibold"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium"
                }`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <span
                    className={`shrink-0 transition-colors ${
                      active ? "text-white" : "text-slate-400 group-hover:text-blue-600"
                    }`}
                  >
                    {l.icon}
                  </span>
                  <span className="truncate">{l.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Log Out Button at Bottom of White Sidebar */}
        <div className="border-t border-slate-100 p-2.5 bg-slate-50/50 shrink-0">
          {isSidebarOpen ? (
            <a
              href="/"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 hover:border-rose-300 py-2 px-3 text-xs font-semibold transition shadow-2xs cursor-pointer active:scale-98"
              title="Log Out"
            >
              <svg
                className="h-4 w-4 shrink-0 text-rose-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span>Log Out</span>
            </a>
          ) : (
            <a
              href="/"
              onClick={handleLogout}
              className="flex h-10 w-10 items-center justify-center rounded-xl mx-auto text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
              title="Log Out"
            >
              <svg
                className="h-4 w-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </a>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col max-w-full overflow-x-hidden">
        {/* Top Header Bar across all internal pages (Desktop - Clean & Minimal) */}
        <header className="sticky top-0 z-40 hidden md:flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur-md shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-tour="sidebar-burger-btn"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:scale-95 transition cursor-pointer"
              title={isSidebarOpen ? "Tutup Menu Sidebar" : "Buka Menu Sidebar"}
              aria-label="Toggle Sidebar Menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-500">KPI System</span>
              <span className="text-slate-300">/</span>
              <span className="font-bold text-slate-800 text-xs">
                {pathname === "/dashboard"
                  ? "Overview Dashboard"
                  : pathname.startsWith("/setup/kpi-config")
                  ? "KPI Configuration"
                  : pathname.startsWith("/setup/templates")
                  ? "Template KPI"
                  : pathname.startsWith("/setup/formulas")
                  ? "Formula Engine Rules"
                  : pathname.startsWith("/setup/assignments")
                  ? "Penugasan & Delegasi"
                  : pathname.startsWith("/setup/master")
                  ? "Master Data"
                  : pathname.startsWith("/input-kpi")
                  ? "Input KPI Bulanan"
                  : pathname.startsWith("/review")
                  ? "Review & Approval"
                  : pathname.startsWith("/report")
                  ? "Report & Export"
                  : pathname.startsWith("/audit")
                  ? "Audit Trail"
                  : "Workspace"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Help / User Guidelines Trigger Button */}
            <button
              type="button"
              data-tour="help-guidelines-btn"
              onClick={handleOpenGuidelines}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-200 text-slate-700 hover:text-blue-700 px-3 py-2 text-xs font-semibold shadow-2xs transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              title="Buka Panduan Penggunaan Sistem KPI (User Guidelines)"
            >
              <svg
                className="h-4 w-4 text-blue-600 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              <span>Panduan</span>
            </button>

            {currentUser && (
              <div ref={profileMenuRef} className="relative">
                {/* Modern Enterprise Profile Trigger Button Desktop */}
                <button
                  type="button"
                  onClick={() => setIsProfileOpen((prev) => !prev)}
                  className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-1.5 transition-all duration-150 active:scale-95 cursor-pointer text-left shadow-2xs group ${
                    isProfileOpen
                      ? "border-sky-400 bg-white ring-2 ring-sky-400/20 shadow-xs"
                      : "border-slate-200/90 bg-white/90 hover:bg-white hover:border-slate-300 hover:shadow-xs"
                  }`}
                  title="Klik untuk melihat profil akun"
                >
                  {/* Modern Avatar with Initials & Active Status Dot */}
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 font-bold text-white text-xs shadow-xs ring-1 ring-white/60">
                    <span>{userInitials}</span>
                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                  </div>

                  <div className="hidden sm:block leading-tight text-left">
                    <div className="font-bold text-slate-800 text-xs truncate max-w-[140px] group-hover:text-sky-900 transition-colors">
                      {currentUser.name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium truncate max-w-[140px]">
                      {profileDetail?.jobPosition || currentUser.jobPosition || (profileDetail?.departmentName || "Karyawan")}
                    </div>
                  </div>

                  {/* Soft Role Badge */}
                  <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md border shrink-0 ${roleBadgeClass}`}>
                    {roleBadgeLabel}
                  </span>

                  <svg
                    className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                      isProfileOpen ? "rotate-180 text-sky-600" : "group-hover:text-slate-600"
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Modern Profile Popover Menu Desktop */}
                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
                    {renderProfilePopoverContent()}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Mobile Header dengan Tombol Menu Burger & Profile Capsule Konsisten */}
        <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 px-3 sm:px-4 py-2 backdrop-blur-md md:hidden flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            {/* Tombol Burger Mobile */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-2xs hover:bg-slate-50 transition active:scale-95 cursor-pointer"
              title="Buka Menu Navigasi"
              aria-label="Buka Menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xs shadow-2xs">
                KPI
              </div>
              <div className="leading-tight">
                <span className="font-bold text-slate-900 text-xs tracking-wider block">KPI SYSTEM</span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {/* Mobile Help / Guidelines Trigger Button */}
            <button
              type="button"
              onClick={handleOpenGuidelines}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-blue-600 shadow-2xs hover:bg-blue-50 transition active:scale-95 cursor-pointer"
              title="Panduan Penggunaan (User Guidelines)"
              aria-label="Panduan Penggunaan"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </button>

            <div ref={mobileProfileMenuRef} className="relative">
            {currentUser && (
              <button
                type="button"
                onClick={() => setIsProfileOpen((prev) => !prev)}
                className={`flex items-center gap-2 rounded-xl border px-2 py-1 transition-all duration-150 active:scale-95 cursor-pointer text-left shadow-2xs group ${
                  isProfileOpen
                    ? "border-sky-400 bg-white ring-2 ring-sky-400/20 shadow-xs"
                    : "border-slate-200/90 bg-white/90 hover:bg-white hover:border-slate-300 hover:shadow-xs"
                }`}
                title="Klik untuk melihat profil akun"
              >
                {/* Modern Avatar with Initials & Active Status Dot */}
                <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 font-bold text-white text-[11px] shadow-xs ring-1 ring-white/60">
                  <span>{userInitials}</span>
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                </div>

                <div className="leading-tight text-left max-w-[70px] xs:max-w-[110px]">
                  <div className="font-bold text-slate-800 text-[11px] truncate group-hover:text-sky-900 transition-colors">
                    {currentUser.name}
                  </div>
                  <div className="text-[9px] text-slate-400 font-medium truncate">
                    {profileDetail?.jobPosition || currentUser.jobPosition || (profileDetail?.departmentName || "Karyawan")}
                  </div>
                </div>

                {/* Soft Role Badge */}
                <span className={`px-1.5 py-0.5 text-[9px] uppercase tracking-wider rounded-md border shrink-0 ${roleBadgeClass}`}>
                  {roleBadgeLabel}
                </span>

                <svg
                  className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${
                    isProfileOpen ? "rotate-180 text-sky-600" : "group-hover:text-slate-600"
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}

            {/* Modern Profile Popover Menu Mobile */}
            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-[calc(100vw-24px)] max-w-xs rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
                {renderProfilePopoverContent()}
                  </div>
                )}
              </div>
            </div>
        </header>

        {/* Mobile Slide-Out Drawer (Terbuka saat burger mobile diklik) */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 z-50 flex bg-slate-900/50 backdrop-blur-xs md:hidden animate-in fade-in duration-200"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <div
              className="w-72 max-w-[80vw] bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Header Clean Slate */}
              <div className="border-b border-slate-100 p-4 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-xs shadow-2xs">
                    KPI
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 tracking-wider">KPI SYSTEM</div>
                    <div className="text-[10px] text-slate-400 font-medium">Enterprise Performance</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                  aria-label="Tutup Menu"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Drawer User Profile Capsule */}
              {currentUser && (
                <div className="p-3 border-b border-slate-100 bg-slate-50/70">
                  <div className="flex items-center gap-2.5">
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 font-bold text-white text-xs shadow-xs ring-1 ring-white/60">
                      <span>{userInitials}</span>
                      <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-800 text-xs truncate max-w-[120px]">{currentUser.name}</span>
                        <span className={`px-1.5 py-0.2 text-[9px] uppercase tracking-wider rounded-md border shrink-0 ${roleBadgeClass}`}>
                          {roleBadgeLabel}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium truncate">
                        {profileDetail?.jobPosition || currentUser.jobPosition || "Karyawan"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Drawer Nav Items */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Navigasi Utama
                </div>
                {visibleNav.map((l) => {
                  const active = isActive(l.href);
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs transition-all ${
                        active
                          ? "bg-blue-600 text-white shadow-xs font-semibold"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium"
                      }`}
                    >
                      <span className={active ? "text-white" : "text-slate-400"}>{l.icon}</span>
                      <span className="truncate">{l.label}</span>
                    </Link>
                  );
                })}

                <div className="pt-2 mt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleOpenGuidelines}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-blue-700 bg-blue-50/70 hover:bg-blue-100/80 transition cursor-pointer"
                  >
                    <svg className="h-4 w-4 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                      />
                    </svg>
                    <span>Panduan Penggunaan</span>
                  </button>
                </div>
              </div>

              {/* Drawer Logout */}
              <div className="border-t border-slate-100 p-3 bg-slate-50">
                <a
                  href="/"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 py-2.5 text-xs font-bold transition cursor-pointer"
                >
                  Log Out
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Page Children */}
        <main className="flex-1 p-3 sm:p-4 md:p-8 min-w-0 max-w-full overflow-x-hidden">{children}</main>
      </div>

      {/* Voluntary Change Password Modal (Dibuka dari profile popover) */}
      {isVoluntaryPassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-600 border border-sky-100">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Ubah Kata Sandi</h3>
                  <p className="text-[11px] text-slate-400">Perbarui kata sandi akun Anda</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsVoluntaryPassModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            {voluntaryPassError && (
              <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs font-semibold text-rose-700">
                {voluntaryPassError}
              </div>
            )}

            <form onSubmit={handleVoluntaryPasswordSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Kata Sandi Baru
                </label>
                <input
                  type="password"
                  value={voluntaryNewPass}
                  onChange={(e) => setVoluntaryNewPass(e.target.value)}
                  placeholder="Minimal 4 karakter"
                  required
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Konfirmasi Kata Sandi
                </label>
                <input
                  type="password"
                  value={voluntaryConfirmPass}
                  onChange={(e) => setVoluntaryConfirmPass(e.target.value)}
                  placeholder="Ulangi kata sandi baru"
                  required
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 transition"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsVoluntaryPassModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingVoluntaryPass}
                  className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50 transition shadow-xs cursor-pointer"
                >
                  {isSubmittingVoluntaryPass ? "Menyimpan..." : "Simpan Kata Sandi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contextual Guided Tour / Spotlight Tutorial */}
      <KpiGuidedTour
        isOpen={isTourOpen}
        currentStep={tourStep}
        userRole={role}
        onStepChange={handleTourStepChange}
        onSkip={handleTourSkip}
        onClose={handleTourClose}
        onFinish={handleTourFinish}
      />
    </div>
  );
}
