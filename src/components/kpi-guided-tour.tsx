"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RoleType } from "@/lib/auth";
import type { OnboardingStatusType } from "@/db/schema";

export interface SubTargetItem {
  label: string;
  selector: string;
  route?: string;
  summary: string;
  points: string[];
}

export interface TourStepConfig {
  step: number;
  code: string;
  title: string;
  primaryRoute: string;
  allowedRoles: RoleType[];
  primarySelector: string;
  fallbackSelectors: string[];
  preferredPlacement: "bottom" | "top" | "right" | "left";
  subTargets: SubTargetItem[];
  fallbackNote: string;
}

export const KPI_TOUR_STEPS: TourStepConfig[] = [
  {
    step: 1,
    code: "STEP 1 OF 6",
    title: "Master Template KPI",
    primaryRoute: "/setup/templates",
    allowedRoles: ["ADMIN"],
    primarySelector: '[data-tour="step-1-template-tabs"]',
    fallbackSelectors: [
      '[data-tour="step-1-template-toolbar"]',
      '[data-tour="nav--setup-templates"]',
      '[data-tour="nav--admin"]',
      '[data-tour="help-guidelines-btn"]',
    ],
    preferredPlacement: "bottom",
    subTargets: [
      {
        label: "Tab Template & Parameter",
        selector: '[data-tour="step-1-template-tabs"]',
        route: "/setup/templates",
        summary: "Beralih antar modul pengelolaan standar KPI dalam satu halaman.",
        points: [
          "Master Template: Kelola daftar struktur template KPI berdasarkan departemen dan jabatan.",
          "Kamus Parameter: Kelola daftar indikator standar beserta satuan dan kriteria default.",
          "Department KPI: Atur nilai target tahunan untuk parameter ber-scope departemen.",
        ],
      },
      {
        label: "Tambah & Generate",
        selector: '[data-tour="step-1-add-template"]',
        route: "/setup/templates",
        summary: "Buat Master Template KPI baru secara manual maupun otomatis.",
        points: [
          "Klik Tambah Template untuk membuat template baru serta mengatur nama, departemen, dan job level.",
          "Klik Generate Template untuk membuat template otomatis berdasarkan pemetaan kategori jabatan.",
        ],
      },
      {
        label: "Tabel & Struktur KPI",
        selector: '[data-tour="step-1-template-table"]',
        route: "/setup/templates",
        summary: "Atur indikator, bobot penilaian, satuan ukur, dan metode hitung KPI.",
        points: [
          "Klik nama template pada tabel untuk membuka pengaturan kategori dan indikator KPI.",
          "Tentukan bobot (%), satuan ukur (%, Hari, Unit, IDR), serta metode hitung (AVERAGE, SUM, LAST_VALUE).",
          "Simpan struktur template setelah status validasi bobot dinyatakan sesuai.",
        ],
      },
    ],
    fallbackNote:
      "Modul Master Template KPI dikelola oleh Administrator untuk menyiapkan standar indikator dan bobot sebelum ditugaskan ke karyawan.",
  },
  {
    step: 2,
    code: "STEP 2 OF 6",
    title: "Import & Export Data",
    primaryRoute: "/setup/templates",
    allowedRoles: ["ADMIN"],
    primarySelector: '[data-tour="step-2-import-btn"]',
    fallbackSelectors: [
      '[data-tour="step-1-add-template"]',
      '[data-tour="step-1-template-table"]',
      '[data-tour="nav--setup-templates"]',
      '[data-tour="nav--report"]',
    ],
    preferredPlacement: "bottom",
    subTargets: [
      {
        label: "Import Excel",
        selector: '[data-tour="step-2-import-btn"]',
        route: "/setup/templates",
        summary: "Unggah file Excel untuk membuat atau memperbarui Master Template secara cepat.",
        points: [
          "Siapkan data indikator, bobot, target, dan kriteria penilaian sesuai format standar Excel.",
          "Klik Import Excel lalu unggah file .xlsx yang telah diisi.",
          "Periksa hasil validasi data pada tabel pratinjau dan perbaiki jika terdapat peringatan sebelum disimpan.",
        ],
      },
      {
        label: "Export & Unduh Batch",
        selector: '[data-tour="step-1-template-table"]',
        route: "/setup/templates",
        summary: "Unduh struktur template KPI ke file Excel untuk dokumentasi atau pembaruan data.",
        points: [
          "Centang satu atau beberapa baris template pada tabel untuk memilih data yang akan diunduh.",
          "Pilih Download Excel Batch (file terpisah) atau 1 File Gabungan (multi-sheet).",
          "File hasil Export juga dapat digunakan sebagai format acuan saat melakukan Import ulang.",
        ],
      },
    ],
    fallbackNote:
      "Fitur Import dan Export Excel tersedia pada modul Template KPI, Master Data, serta Report & Export untuk pengelolaan data berformat .xlsx.",
  },
  {
    step: 3,
    code: "STEP 3 OF 6",
    title: "Master Data",
    primaryRoute: "/setup/master?tab=karyawan",
    allowedRoles: ["ADMIN", "HR"],
    primarySelector: '[data-tour="step-3-master-tabs"]',
    fallbackSelectors: [
      '[data-tour="step-3-master-actions"]',
      '[data-tour="step-3-master-table"]',
      '[data-tour="nav--admin"]',
      '[data-tour="help-guidelines-btn"]',
    ],
    preferredPlacement: "bottom",
    subTargets: [
      {
        label: "Kategori Master Data",
        selector: '[data-tour="step-3-master-tabs"]',
        route: "/setup/master?tab=karyawan",
        summary: "Kelola data utama organisasi yang terhubung langsung dengan proses KPI.",
        points: [
          "Beralih antar tab Karyawan, Departemen, Job Position, Job Level, Operating Units, dan PIT.",
          "Kesesuaian Departemen dan Job Position menentukan template KPI serta alur persetujuan karyawan.",
        ],
      },
      {
        label: "Tambah, Import & Sync",
        selector: '[data-tour="step-3-master-actions"]',
        route: "/setup/master?tab=karyawan",
        summary: "Tambahkan atau perbarui data kepegawaian secara manual, Excel, maupun ERP.",
        points: [
          "Gunakan tombol + Tambah Karyawan untuk input manual atau Sync Odoo untuk tarik data ERP.",
          "Buka menu Actions untuk mengunduh template Excel, mengimpor data massal, atau mengekspor data.",
        ],
      },
      {
        label: "Tabel & Hirarki Penilai",
        selector: '[data-tour="step-3-master-table"]',
        route: "/setup/master?tab=karyawan",
        summary: "Lihat dan perbarui profil karyawan beserta susunan atasan penilai.",
        points: [
          "Gunakan kolom pencarian dan filter unit operasional untuk menemukan data dengan cepat.",
          "Edit data karyawan untuk memperbarui jabatan, Penilai langsung, Head Department, atau status aktif.",
        ],
      },
    ],
    fallbackNote:
      "Master Data menghubungkan profil karyawan, departemen, jabatan, dan hirarki atasan yang digunakan otomatis pada penilaian KPI.",
  },
  {
    step: 4,
    code: "STEP 4 OF 6",
    title: "Assign Template",
    primaryRoute: "/setup/assignments?tab=template",
    allowedRoles: ["ADMIN"],
    primarySelector: '[data-tour="step-4-assign-toolbar"]',
    fallbackSelectors: [
      '[data-tour="step-4-assign-table"]',
      '[data-tour="step-4-assign-tabs"]',
      '[data-tour="nav--admin"]',
      '[data-tour="help-guidelines-btn"]',
    ],
    preferredPlacement: "bottom",
    subTargets: [
      {
        label: "Filter & Tambah Penugasan",
        selector: '[data-tour="step-4-assign-toolbar"]',
        route: "/setup/assignments?tab=template",
        summary: "Terapkan Master Template KPI ke karyawan atau departemen pada periode berjalan.",
        points: [
          "Pilih Periode penilaian aktif serta filter Departemen atau Status yang ingin diperiksa.",
          "Klik + Tambah Penugasan, pilih template KPI, lalu tentukan target (Departemen, Jabatan, atau Individu).",
          "Simpan penugasan agar lembar penilaian KPI karyawan siap diisi.",
        ],
      },
      {
        label: "Tabel Penugasan",
        selector: '[data-tour="step-4-assign-table"]',
        route: "/setup/assignments?tab=template",
        summary: "Periksa dan ubah langsung template KPI yang terpasang pada karyawan.",
        points: [
          "Lihat status template yang terpasang pada setiap karyawan di periode aktif.",
          "Gunakan pilihan Ganti Template atau tombol Lepas pada kolom Aksi untuk memperbarui penugasan.",
        ],
      },
      {
        label: "Asesor & Delegasi",
        selector: '[data-tour="step-4-assign-tabs"]',
        route: "/setup/assignments?tab=template",
        summary: "Kelola penugasan asesor per template KPI dan pelimpahan wewenang penilaian.",
        points: [
          "Tab Penugasan Asesor KPI mengatur siapa menilai siapa berdasarkan Template KPI.",
          "Tab Delegasi Penilaian mengatur pelimpahan wewenang sementara antar penilai sesuai rentang tanggal.",
        ],
      },
    ],
    fallbackNote:
      "Melalui Assign Template, setiap karyawan dihubungkan dengan template indikator KPI sesuai posisi dan periode penilaian aktif.",
  },
  {
    step: 5,
    code: "STEP 5 OF 6",
    title: "KPI Target & Realisasi",
    primaryRoute: "/input-kpi",
    allowedRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
    primarySelector: '[data-tour="step-5-kpi-table"]',
    fallbackSelectors: [
      '[data-tour="step-5-header-filter"]',
      '[data-tour="nav--input-kpi"]',
    ],
    preferredPlacement: "top",
    subTargets: [
      {
        label: "Daftar & Input Realisasi",
        selector: '[data-tour="step-5-kpi-table"]',
        route: "/input-kpi",
        summary: "Kelola target tahunan, realisasi bulanan, dan bukti pendukung penilaian KPI.",
        points: [
          "Klik nama karyawan pada tabel untuk membuka lembar evaluasi KPI.",
          "Isi nilai realisasi bulanan (dihitung otomatis dengan metode SUM, AVG, atau LAST_VALUE) atau tahunan.",
          "Lampirkan dokumen bukti pendukung (evidence) dan periksa hasil kalkulasi skor KPI.",
        ],
      },
      {
        label: "Filter Departemen",
        selector: '[data-tour="step-5-header-filter"]',
        route: "/input-kpi",
        summary: "Saring daftar penilaian karyawan berdasarkan departemen.",
        points: [
          "Gunakan dropdown Departemen di kanan atas untuk menampilkan karyawan pada divisi tertentu.",
          "Pantau status kelengkapan pengisian indikator pada setiap baris karyawan.",
        ],
      },
    ],
    fallbackNote:
      "Buka menu Penilaian KPI (/input-kpi) lalu klik baris karyawan untuk mengisi realisasi bulanan, melampirkan bukti pendukung, dan memeriksa skor.",
  },
  {
    step: 6,
    code: "STEP 6 OF 6",
    title: "Approval & Reporting",
    primaryRoute: "/input-kpi",
    allowedRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
    primarySelector: '[data-tour="step-6-staging-tabs"]',
    fallbackSelectors: [
      '[data-tour="step-6-report-export"]',
      '[data-tour="step-6-report-tabs"]',
      '[data-tour="nav--report"]',
    ],
    preferredPlacement: "bottom",
    subTargets: [
      {
        label: "Alur Staging Approval",
        selector: '[data-tour="step-6-staging-tabs"]',
        route: "/input-kpi",
        summary: "Pantau tahapan pengajuan, pemeriksaan, dan persetujuan KPI berjenjang.",
        points: [
          "Ajukan KPI yang telah terisi dari status Draft ke In Review untuk diperiksa Supervisor / Penilai.",
          "Persetujuan dilanjutkan secara berjenjang oleh Head Department hingga berstatus Approved / Final.",
          "Tab Revision menampilkan penilaian yang dikembalikan beserta catatan perbaikan.",
        ],
      },
      {
        label: "Laporan & Export Excel",
        selector: '[data-tour="step-6-report-export"]',
        route: "/report",
        summary: "Lihat hasil akhir penilaian kinerja dan unduh laporan resmi KPI.",
        points: [
          "Buka halaman Report & Export untuk memeriksa rekapitulasi skor akhir dan predikat kinerja.",
          "Klik tombol Export Excel (.xlsx) untuk mengunduh laporan KPI lengkap per periode.",
        ],
      },
      {
        label: "Summary & Statistik",
        selector: '[data-tour="step-6-report-tabs"]',
        route: "/report",
        summary: "Analisis perbandingan capaian KPI antar departemen dan distribusi grade.",
        points: [
          "Tab Summary KPI menampilkan tabel rekapitulasi skor seluruh karyawan secara mendetail.",
          "Tab Statistik & Analisis menampilkan rata-rata skor departemen serta grafik distribusi grade.",
        ],
      },
    ],
    fallbackNote:
      "Gunakan tab Staging pada halaman Input KPI untuk memantau status persetujuan, dan buka menu Report & Export untuk mengunduh rekapitulasi Excel.",
  },
];

interface KpiGuidedTourProps {
  isOpen: boolean;
  currentStep: number;
  userRole: RoleType;
  onStepChange: (nextStep: number) => void;
  onSkip: () => void;
  onClose: () => void;
  onFinish: () => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function KpiGuidedTour({
  isOpen,
  currentStep,
  userRole,
  onStepChange,
  onSkip,
  onClose,
  onFinish,
}: KpiGuidedTourProps) {
  const router = useRouter();
  const pathname = usePathname();
  const tooltipRef = useRef<HTMLDivElement>(null);

  const stepConfig =
    KPI_TOUR_STEPS.find((s) => s.step === currentStep) || KPI_TOUR_STEPS[0];

  const [activeSubIndex, setActiveSubIndex] = useState<number>(0);
  const [targetRect, setTargetRect] = useState<SpotlightRect | null>(null);
  const [isUsingFallback, setIsUsingFallback] = useState<boolean>(false);
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
    placement: "bottom" | "top" | "right" | "left" | "center";
  }>({
    top: 120,
    left: 120,
    placement: "bottom",
  });

  const activeSubTarget =
    stepConfig.subTargets[activeSubIndex] || stepConfig.subTargets[0];

  // Reset sub-target index when step changes
  useEffect(() => {
    setActiveSubIndex(0);
  }, [currentStep]);

  // Navigate to the step's target route if allowed by userRole and not already on it
  useEffect(() => {
    if (!isOpen) return;

    const canAccessPrimaryRoute = stepConfig.allowedRoles.includes(userRole);
    if (!canAccessPrimaryRoute) {
      setIsNavigating(false);
      return;
    }

    const desiredRoute = activeSubTarget?.route || stepConfig.primaryRoute;
    const [desiredBasePath] = desiredRoute.split("?");

    if (pathname !== desiredBasePath) {
      setIsNavigating(true);
      router.push(desiredRoute);
    } else {
      setIsNavigating(false);
    }
  }, [isOpen, currentStep, activeSubIndex, stepConfig, activeSubTarget, userRole, pathname, router]);

  // Find target DOM element and measure its bounding rect
  const locateAndMeasureTarget = useCallback(
    (shouldScroll = false) => {
      if (!isOpen || typeof window === "undefined") return;

      const primaryCandidate = activeSubTarget?.selector || stepConfig.primarySelector;

      let foundEl: HTMLElement | null = null;
      let usedFallback = false;

      const candidate = document.querySelector(primaryCandidate) as HTMLElement | null;
      if (candidate && candidate.offsetParent !== null) {
        foundEl = candidate;
      } else {
        usedFallback = true;
        for (const fbSelector of stepConfig.fallbackSelectors) {
          const fbEl = document.querySelector(fbSelector) as HTMLElement | null;
          if (fbEl && fbEl.offsetParent !== null) {
            foundEl = fbEl;
            break;
          }
        }
      }

      setIsUsingFallback(usedFallback);

      if (!foundEl) {
        setTargetRect(null);
        return;
      }

      if (shouldScroll) {
        const rawRect = foundEl.getBoundingClientRect();
        const isOutOfView =
          rawRect.top < 72 ||
          rawRect.bottom > window.innerHeight - 72 ||
          rawRect.left < 0 ||
          rawRect.right > window.innerWidth;

        if (isOutOfView) {
          foundEl.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        }
      }

      const rect = foundEl.getBoundingClientRect();
      const pad = 8;
      const top = Math.max(4, rect.top - pad);
      const left = Math.max(4, rect.left - pad);
      const width = Math.min(window.innerWidth - left - 4, rect.width + pad * 2);
      const height = Math.min(window.innerHeight - top - 4, rect.height + pad * 2);

      setTargetRect({ top, left, width, height });
    },
    [isOpen, stepConfig, activeSubTarget]
  );

  // Trigger locate and scroll when step, sub-target, or pathname changes
  useEffect(() => {
    if (!isOpen) return;

    locateAndMeasureTarget(true);
    const t1 = setTimeout(() => locateAndMeasureTarget(true), 180);
    const t2 = setTimeout(() => locateAndMeasureTarget(false), 450);
    const t3 = setTimeout(() => {
      setIsNavigating(false);
      locateAndMeasureTarget(false);
    }, 750);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isOpen, currentStep, activeSubIndex, pathname, locateAndMeasureTarget]);

  // Reposition on window scroll and resize
  useEffect(() => {
    if (!isOpen) return;

    let rafId: number | null = null;
    const handleUpdate = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        locateAndMeasureTarget(false);
      });
    };

    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("resize", handleUpdate);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("resize", handleUpdate);
    };
  }, [isOpen, locateAndMeasureTarget]);

  // Calculate smart floating tooltip coordinates around targetRect
  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw < 640;

    const tooltipEl = tooltipRef.current;
    const tooltipW = tooltipEl ? tooltipEl.offsetWidth : isMobile ? vw - 24 : 400;
    const tooltipH = tooltipEl ? tooltipEl.offsetHeight : 310;
    const gap = 14;
    const margin = 12;

    if (!targetRect) {
      setTooltipPos({
        top: Math.max(margin, Math.round((vh - tooltipH) / 2)),
        left: Math.max(margin, Math.round((vw - tooltipW) / 2)),
        placement: "center",
      });
      return;
    }

    const spaceBottom = vh - (targetRect.top + targetRect.height);
    const spaceTop = targetRect.top;
    const spaceRight = vw - (targetRect.left + targetRect.width);
    const spaceLeft = targetRect.left;

    if (isMobile) {
      if (spaceBottom >= tooltipH + gap || spaceBottom >= spaceTop) {
        const top = Math.min(
          vh - tooltipH - margin,
          Math.max(margin, targetRect.top + targetRect.height + gap)
        );
        setTooltipPos({
          top,
          left: margin,
          placement: "bottom",
        });
      } else {
        const top = Math.max(margin, targetRect.top - tooltipH - gap);
        setTooltipPos({
          top,
          left: margin,
          placement: "top",
        });
      }
      return;
    }

    const candidates: Array<"bottom" | "top" | "right" | "left"> = [
      stepConfig.preferredPlacement,
      "bottom",
      "top",
      "right",
      "left",
    ];

    let chosen: "bottom" | "top" | "right" | "left" = stepConfig.preferredPlacement;
    for (const dir of candidates) {
      if (dir === "bottom" && spaceBottom >= tooltipH + gap) {
        chosen = "bottom";
        break;
      }
      if (dir === "top" && spaceTop >= tooltipH + gap) {
        chosen = "top";
        break;
      }
      if (dir === "right" && spaceRight >= tooltipW + gap) {
        chosen = "right";
        break;
      }
      if (dir === "left" && spaceLeft >= tooltipW + gap) {
        chosen = "left";
        break;
      }
    }

    if (
      (chosen === "bottom" && spaceBottom < tooltipH + gap) ||
      (chosen === "top" && spaceTop < tooltipH + gap)
    ) {
      if (spaceBottom >= spaceTop && spaceBottom >= 200) {
        chosen = "bottom";
      } else if (spaceTop >= 200) {
        chosen = "top";
      } else if (spaceRight >= tooltipW + gap) {
        chosen = "right";
      } else if (spaceLeft >= tooltipW + gap) {
        chosen = "left";
      }
    }

    let top = margin;
    let left = margin;

    if (chosen === "bottom") {
      top = targetRect.top + targetRect.height + gap;
      left = targetRect.left + targetRect.width / 2 - tooltipW / 2;
    } else if (chosen === "top") {
      top = targetRect.top - tooltipH - gap;
      left = targetRect.left + targetRect.width / 2 - tooltipW / 2;
    } else if (chosen === "right") {
      top = targetRect.top + targetRect.height / 2 - tooltipH / 2;
      left = targetRect.left + targetRect.width + gap;
    } else if (chosen === "left") {
      top = targetRect.top + targetRect.height / 2 - tooltipH / 2;
      left = targetRect.left - tooltipW - gap;
    }

    left = Math.max(margin, Math.min(vw - tooltipW - margin, Math.round(left)));
    top = Math.max(margin, Math.min(vh - tooltipH - margin, Math.round(top)));

    const overlapsHorizontally =
      left < targetRect.left + targetRect.width && left + tooltipW > targetRect.left;
    const overlapsVertically =
      top < targetRect.top + targetRect.height && top + tooltipH > targetRect.top;

    if (overlapsHorizontally && overlapsVertically) {
      if (spaceTop >= spaceBottom && spaceTop > 120) {
        top = Math.max(margin, targetRect.top - tooltipH - gap);
      } else {
        top = Math.max(margin, Math.min(vh - tooltipH - margin, targetRect.top + 16));
        left = Math.max(margin, vw - tooltipW - 24);
      }
    }

    setTooltipPos({ top, left, placement: chosen });
  }, [isOpen, targetRect, stepConfig.preferredPlacement, currentStep, activeSubIndex]);

  // Keyboard navigation (Escape, ArrowRight, ArrowLeft)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (currentStep < KPI_TOUR_STEPS.length) {
          onStepChange(currentStep + 1);
        } else {
          onFinish();
        }
      } else if (e.key === "ArrowLeft" && currentStep > 1) {
        e.preventDefault();
        onStepChange(currentStep - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentStep, onStepChange, onClose, onFinish]);

  if (!isOpen) return null;

  const isFirstStep = currentStep <= 1;
  const isLastStep = currentStep >= KPI_TOUR_STEPS.length;

  return (
    <div
      className="fixed inset-0 z-[95] pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kpi-guided-tour-title"
    >
      {/* 1. SVG Spotlight Mask Overlay */}
      <svg
        className="fixed inset-0 w-full h-full pointer-events-none transition-opacity duration-300"
        aria-hidden="true"
      >
        <defs>
          <mask id="kpi-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="12"
                ry="12"
                fill="black"
                className="transition-all duration-300 ease-out"
              />
            )}
          </mask>
        </defs>

        {/* Dimmed backdrop outside spotlight */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.58)"
          mask="url(#kpi-spotlight-mask)"
        />

        {/* Active Spotlight Border Ring */}
        {targetRect && (
          <>
            <rect
              x={Math.max(1, targetRect.left - 3)}
              y={Math.max(1, targetRect.top - 3)}
              width={targetRect.width + 6}
              height={targetRect.height + 6}
              rx="14"
              ry="14"
              fill="none"
              stroke="rgba(37, 99, 235, 0.35)"
              strokeWidth="4"
              className="transition-all duration-300 ease-out"
            />
            <rect
              x={targetRect.left}
              y={targetRect.top}
              width={targetRect.width}
              height={targetRect.height}
              rx="12"
              ry="12"
              fill="none"
              stroke="#2563EB"
              strokeWidth="2.5"
              className="transition-all duration-300 ease-out"
            />
          </>
        )}
      </svg>

      {/* 2. Contextual Floating Popover Card */}
      <div
        ref={tooltipRef}
        style={{
          top: `${tooltipPos.top}px`,
          left: `${tooltipPos.left}px`,
        }}
        className="fixed z-[100] pointer-events-auto w-[calc(100vw-24px)] sm:w-[400px] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl transition-all duration-300 ease-out overflow-hidden"
      >
        {/* Top Header Bar (#16345B Dark Navy) */}
        <div className="bg-[#16345B] text-white px-4 py-2.5 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center justify-center rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase text-white shrink-0">
              Step {stepConfig.step} of {KPI_TOUR_STEPS.length}
            </span>
            <h3
              id="kpi-guided-tour-title"
              className="text-xs font-bold text-white truncate"
            >
              {stepConfig.title}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panduan (Close)"
            title="Tutup panduan (Esc)"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-200 hover:text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white transition cursor-pointer shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 6-Step Segmented Progress Bar */}
        <div className="bg-slate-50 px-4 py-1.5 border-b border-slate-200 flex items-center gap-1.5 shrink-0">
          {KPI_TOUR_STEPS.map((item) => {
            const isDone = item.step < currentStep;
            const isCurrent = item.step === currentStep;
            return (
              <button
                key={item.step}
                type="button"
                onClick={() => onStepChange(item.step)}
                title={`Buka Step ${item.step}: ${item.title}`}
                aria-label={`Step ${item.step}: ${item.title}`}
                className={`h-1.5 flex-1 rounded-full transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isCurrent
                    ? "bg-blue-600"
                    : isDone
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-slate-200 hover:bg-slate-300"
                }`}
              />
            );
          })}
        </div>

        {/* Compact Content Body Adapted to Selected Sub-Element */}
        <div className="p-4 space-y-3 text-slate-900">
          {/* Interactive Element Tabs */}
          {stepConfig.subTargets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {stepConfig.subTargets.map((sub, idx) => {
                const isSelected = activeSubIndex === idx;
                return (
                  <button
                    key={sub.label}
                    type="button"
                    onClick={() => setActiveSubIndex(idx)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200/80 border border-slate-200"
                    }`}
                  >
                    {sub.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Dynamic Content Box for the Selected Tab */}
          {activeSubTarget && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-800 leading-snug">
                  {activeSubTarget.summary}
                </p>
                {isNavigating && (
                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shrink-0">
                    Memuat...
                  </span>
                )}
              </div>

              <ul className="space-y-1.5 pt-0.5">
                {activeSubTarget.points.map((pt, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed"
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                      {i + 1}
                    </span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Fallback Context Note when target element is on another role/view */}
          {(isUsingFallback || !targetRect) && !isNavigating && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-2.5 text-[11px] text-slate-800 leading-relaxed flex items-start gap-2">
              <svg
                className="w-4 h-4 text-blue-700 shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{stepConfig.fallbackNote}</span>
            </div>
          )}
        </div>

        {/* Footer Controls: Skip Guide, Previous, Next / Finish */}
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onSkip}
            className="min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 transition cursor-pointer"
          >
            Skip Guide
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isFirstStep}
              onClick={() => {
                if (!isFirstStep) onStepChange(currentStep - 1);
              }}
              className="min-h-[36px] px-3 py-1 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 transition cursor-pointer"
            >
              Previous
            </button>

            {isLastStep ? (
              <button
                type="button"
                onClick={onFinish}
                className="min-h-[36px] px-3.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 transition cursor-pointer"
              >
                Finish
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onStepChange(currentStep + 1)}
                className="min-h-[36px] px-3.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 transition cursor-pointer"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Helper untuk membaca dan menyimpan status onboarding pengguna ke backend (/api/onboarding)
 * disertai cadangan localStorage per NIK agar bebas flicker saat berpindah halaman.
 */
export async function fetchUserOnboardingStatus(nik: string): Promise<{
  status: OnboardingStatusType;
  currentStep: number;
}> {
  try {
    const res = await fetch("/api/onboarding", {
      method: "GET",
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.status) {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            `kpi_onboarding_${nik}`,
            JSON.stringify({
              status: data.status,
              currentStep: data.currentStep || 1,
            })
          );
        }
        return {
          status: data.status as OnboardingStatusType,
          currentStep: data.currentStep || 1,
        };
      }
    }
  } catch (err) {
    console.error("Failed to fetch onboarding status:", err);
  }

  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(`kpi_onboarding_${nik}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return {
          status: (parsed.status as OnboardingStatusType) || "NOT_STARTED",
          currentStep: parsed.currentStep || 1,
        };
      } catch {}
    }
  }

  return { status: "NOT_STARTED", currentStep: 1 };
}

export async function saveUserOnboardingStatus(
  nik: string,
  status: OnboardingStatusType,
  currentStep: number
): Promise<void> {
  if (typeof window !== "undefined" && nik) {
    window.localStorage.setItem(
      `kpi_onboarding_${nik}`,
      JSON.stringify({ status, currentStep })
    );
  }

  try {
    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, currentStep }),
    });
  } catch (err) {
    console.error("Failed to save onboarding status:", err);
  }
}
