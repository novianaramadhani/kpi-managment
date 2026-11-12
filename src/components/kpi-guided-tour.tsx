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
    code: "STEP 1 OF 8",
    title: "Navigasi Menu (Burger Sidebar)",
    primaryRoute: "",
    allowedRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
    primarySelector: '[data-tour="sidebar-nav-container"]',
    fallbackSelectors: [
      '[data-tour="sidebar-burger-btn"]',
      '[data-tour="nav--dashboard"]',
      '[data-tour="nav--admin"]',
      '[data-tour="help-guidelines-btn"]',
    ],
    preferredPlacement: "right",
    subTargets: [
      {
        label: "Buka & Tutup Sidebar",
        selector: '[data-tour="sidebar-nav-container"]',
        summary: "Pusat navigasi utama untuk berpindah antar modul sistem KPI secara cepat.",
        points: [
          "Klik tombol burger (≡) di pojok kiri atas untuk membuka atau memperkecil sidebar menu.",
          "Sidebar memuat menu lengkap yang disesuaikan dengan wewenang (role) pengguna.",
        ],
      },
      {
        label: "Daftar Fitur Utama",
        selector: '[data-tour="sidebar-nav-container"]',
        summary: "Ikhtisar jalan pintas ke seluruh fitur utama aplikasi.",
        points: [
          "Dashboard: Ringkasan performa dan grafik pencapaian nilai KPI.",
          "Admin Menu: Pengaturan master data, penugasan asesor, dan formula acuan.",
          "Template KPI: Standarisasi struktur indikator dan bobot penilaian.",
          "Penilaian KPI: Lembar input realisasi bulanan dan persetujuan atasan.",
          "Report & Export: Rekapitulasi nilai akhir dan ekspor laporan Excel resmi.",
        ],
      },
    ],
    fallbackNote:
      "Gunakan tombol burger di kiri atas untuk membuka bilah navigasi samping yang memuat seluruh modul sistem KPI.",
  },
  {
    step: 2,
    code: "STEP 2 OF 8",
    title: "Overview Dashboard",
    primaryRoute: "/dashboard",
    allowedRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
    primarySelector: '[data-tour="nav--dashboard"]',
    fallbackSelectors: [
      '[data-tour="sidebar-nav-container"]',
      '[data-tour="sidebar-burger-btn"]',
      '[data-tour="help-guidelines-btn"]',
    ],
    preferredPlacement: "bottom",
    subTargets: [
      {
        label: "Metrik Performa",
        selector: '[data-tour="nav--dashboard"]',
        route: "/dashboard",
        summary: "Pemantauan komprehensif atas pencapaian indikator kinerja pada periode aktif.",
        points: [
          "Rata-rata Skor: Mengetahui capaian nilai kinerja individu maupun seluruh departemen.",
          "Distribusi Predikat: Grafik sebaran grade kinerja (Outstanding, Exceed, Meet, Need Improvement).",
        ],
      },
      {
        label: "Status Keterisian",
        selector: '[data-tour="nav--dashboard"]',
        route: "/dashboard",
        summary: "Pelacakan lembar evaluasi yang memerlukan pengisian atau persetujuan tindak lanjut.",
        points: [
          "Status Penilaian: Melihat jumlah KPI berstatus Draft, Dalam Review, maupun Selesai.",
          "Akses Instan: Klik baris penilaian untuk langsung menuju lembar kerja terkait.",
        ],
      },
    ],
    fallbackNote:
      "Halaman Dashboard (/dashboard) menyajikan grafik dan ringkasan capaian kinerja seluruh unit kerja.",
  },
  {
    step: 3,
    code: "STEP 3 OF 8",
    title: "Master Data Organisasi & Karyawan",
    primaryRoute: "/setup/master?tab=karyawan",
    allowedRoles: ["ADMIN", "HR"],
    primarySelector: '[data-tour="step-1-master-tabs"]',
    fallbackSelectors: [
      '[data-tour="step-3-master-tabs"]',
      '[data-tour="step-1-master-actions"]',
      '[data-tour="step-1-master-table"]',
      '[data-tour="nav--admin"]',
      '[data-tour="sidebar-nav-container"]',
    ],
    preferredPlacement: "bottom",
    subTargets: [
      {
        label: "Master Karyawan",
        selector: '[data-tour="step-1-master-tabs"]',
        route: "/setup/master?tab=karyawan",
        summary: "Pondasi utama profil kepegawaian dan struktur penilai KPI.",
        points: [
          "Profil & NIK: Kelola identitas karyawan, departemen, jabatan, dan tanggal bergabung.",
          "Hirarki Penilai: Menetapkan Penilai langsung (Supervisor) dan Head of Department.",
        ],
      },
      {
        label: "Departemen & Jabatan",
        selector: '[data-tour="step-1-master-tabs"]',
        route: "/setup/master?tab=departemen",
        summary: "Struktur organisasi penentu penugasan template dan otoritas wewenang.",
        points: [
          "Departemen: Menata unit kerja operasional dan target KPI berbasis divisi.",
          "Job Position & Level: Menentukan bobot tanggung jawab dan hierarki penilaian.",
        ],
      },
      {
        label: "Operating Units & PIT",
        selector: '[data-tour="step-1-master-tabs"]',
        route: "/setup/master?tab=operating-units",
        summary: "Cakupan penempatan lokasi kerja dan area tambang operasional.",
        points: [
          "Operating Units: Pengelompokan lokasi kerja site atau kantor pusat untuk filter data.",
          "Master PIT: Manajemen area tambang khusus operasional lapangan.",
        ],
      },
      {
        label: "Sync ERP & Import Excel",
        selector: '[data-tour="step-1-master-actions"]',
        route: "/setup/master?tab=karyawan",
        summary: "Otomasi pembaruan data kepegawaian dari sistem ERP Odoo atau file spreadsheet.",
        points: [
          "Sinkron Odoo: Tarik data karyawan dan mutasi posisi terbaru langsung dari ERP.",
          "Import / Export: Unduh template Excel untuk update massal atau cadangkan data resmi.",
        ],
      },
    ],
    fallbackNote:
      "Master Data menghubungkan profil karyawan, departemen, jabatan, dan hirarki atasan yang digunakan otomatis pada lembar penilaian KPI.",
  },
  {
    step: 4,
    code: "STEP 4 OF 8",
    title: "Konfigurasi Indikator & Formula KPI",
    primaryRoute: "/setup/kpi-config?tab=measurement",
    allowedRoles: ["ADMIN"],
    primarySelector: '[data-tour="step-2-config-tabs"]',
    fallbackSelectors: [
      '[data-tour="nav--setup-kpi-config"]',
      '[data-tour="nav--admin"]',
      '[data-tour="sidebar-nav-container"]',
    ],
    preferredPlacement: "bottom",
    subTargets: [
      {
        label: "Measurement Type",
        selector: '[data-tour="step-2-config-tabs"]',
        route: "/setup/kpi-config?tab=measurement",
        summary: "Standarisasi satuan dan tipe data nilai aktual indikator kinerja.",
        points: [
          "Format Nilai: Angka (Number), Persentase (%), Mata Uang (IDR), Hari, Unit, Rasio, Rating.",
          "Validasi Nilai: Memastikan batasan angka input aktual konsisten di seluruh departemen.",
        ],
      },
      {
        label: "KPI Direction",
        selector: '[data-tour="step-2-config-tabs"]',
        route: "/setup/kpi-config?tab=direction",
        summary: "Arah evaluasi target capaian indikator untuk formula engine.",
        points: [
          "Higher is Better: Nilai aktual makin tinggi makin memuaskan (omzet, produksi, efisiensi).",
          "Lower is Better: Nilai aktual makin rendah makin baik (lead time, biaya, insiden, komplain).",
          "Target Range & Exact: Memerlukan capaian tepat sasaran atau berada dalam rentang toleransi.",
        ],
      },
      {
        label: "Scoring Method",
        selector: '[data-tour="step-2-config-tabs"]',
        route: "/setup/kpi-config?tab=scoring",
        summary: "Metode kalkulasi otomatis perolehan skor akhir setiap parameter.",
        points: [
          "Criteria Based: Berdasarkan pencocokan tabel rentang kriteria (bands) nilai.",
          "Formula Based: Menggunakan rumus kalkulasi acuan matematika otomatis dari formula engine.",
        ],
      },
    ],
    fallbackNote:
      "Modul Konfigurasi KPI dikelola oleh Administrator untuk standarisasi tipe data, arah penilaian, dan formula hitung acuan.",
  },
  {
    step: 5,
    code: "STEP 5 OF 8",
    title: "Master Template KPI & Standar Nilai",
    primaryRoute: "/setup/templates",
    allowedRoles: ["ADMIN"],
    primarySelector: '[data-tour="step-3-template-tabs"]',
    fallbackSelectors: [
      '[data-tour="step-1-template-tabs"]',
      '[data-tour="step-3-template-table"]',
      '[data-tour="step-3-add-template"]',
      '[data-tour="nav--setup-templates"]',
      '[data-tour="sidebar-nav-container"]',
    ],
    preferredPlacement: "bottom",
    subTargets: [
      {
        label: "Master Template",
        selector: '[data-tour="step-3-template-tabs"]',
        route: "/setup/templates",
        summary: "Cetak biru matriks penilaian KPI berdasarkan departemen dan level jabatan.",
        points: [
          "Struktur Indikator: Menentukan kategori (Hard Skill, Soft Skill, Target Kerja).",
          "Validasi Bobot: Total bobot seluruh indikator dalam satu template wajib tepat 100%.",
        ],
      },
      {
        label: "Kamus Parameter",
        selector: '[data-tour="step-3-template-tabs"]',
        route: "/setup/templates",
        summary: "Katalog indikator standar terpusat untuk dipakai ulang di berbagai template.",
        points: [
          "Katalog Terpusat: Deskripsi KPI, satuan ukur default, dan metode hitung acuan.",
          "Standar Kriteria: Menetapkan batasan nilai default agar penilaian seragam antar divisi.",
        ],
      },
      {
        label: "Tambah & Generate",
        selector: '[data-tour="step-3-add-template"]',
        route: "/setup/templates",
        summary: "Membuat template KPI baru secara mandiri atau dibuat otomatis oleh sistem.",
        points: [
          "Tambah Manual: Atur nama template, departemen, dan level jabatan secara spesifik.",
          "Generate Otomatis: Susun template otomatis berdasarkan pemetaan kategori posisi kerja.",
        ],
      },
      {
        label: "Import & Export Excel",
        selector: '[data-tour="step-3-import-btn"]',
        route: "/setup/templates",
        summary: "Kelola berkas spreadsheet .xlsx untuk pembuatan dan pencadangan template massal.",
        points: [
          "Import Excel: Upload format standar Excel berisi indikator, bobot, target, dan kriteria.",
          "Export Batch: Unduh arsip seluruh template untuk dokumentasi atau format acuan offline.",
        ],
      },
    ],
    fallbackNote:
      "Master Template KPI menyusun cetak biru matriks penilaian sebelum ditugaskan ke karyawan pada periode aktif.",
  },
  {
    step: 6,
    code: "STEP 6 OF 8",
    title: "Penugasan Template & Asesor KPI",
    primaryRoute: "/setup/assignments?tab=template",
    allowedRoles: ["ADMIN"],
    primarySelector: '[data-tour="step-4-assign-toolbar"]',
    fallbackSelectors: [
      '[data-tour="step-4-assign-table"]',
      '[data-tour="step-4-assign-tabs"]',
      '[data-tour="nav--admin"]',
      '[data-tour="sidebar-nav-container"]',
    ],
    preferredPlacement: "bottom",
    subTargets: [
      {
        label: "Penugasan Karyawan",
        selector: '[data-tour="step-4-assign-toolbar"]',
        route: "/setup/assignments?tab=template",
        summary: "Pemasangan template KPI ke karyawan aktif pada periode penilaian berjalan.",
        points: [
          "Penugasan Massal: Terapkan template ke seluruh departemen atau jabatan sekaligus.",
          "Ganti / Lepas: Ubah atau sesuaikan template per individu jika ada mutasi kerja.",
        ],
      },
      {
        label: "Matriks Multi-Asesor",
        selector: '[data-tour="step-4-assign-tabs"]',
        route: "/setup/assignments?tab=penugasan-asesor",
        summary: "Pengaturan pemetaan siapa menilai siapa (Many-to-Many) pada lembar kerja KPI.",
        points: [
          "Multi-Asesor: Menugaskan lebih dari satu penilai untuk parameter KPI yang berbeda.",
          "Penilaian Lintas Divisi: Menghubungkan supervisor lain jika ada proyek kolaboratif.",
        ],
      },
      {
        label: "Delegasi Wewenang",
        selector: '[data-tour="step-4-assign-tabs"]',
        route: "/setup/assignments?tab=delegasi",
        summary: "Pelimpahan hak akses penilaian sementara jika penilai berhalangan hadir.",
        points: [
          "Rentang Waktu: Tentukan batas tanggal aktif pendelegasian wewenang.",
          "Otoritas Sah: Penilai pengganti dapat mengisi realisasi dan memberikan persetujuan resmi.",
        ],
      },
    ],
    fallbackNote:
      "Melalui Penugasan Template & Asesor, setiap karyawan dihubungkan dengan template indikator dan penilai yang berwenang.",
  },
  {
    step: 7,
    code: "STEP 7 OF 8",
    title: "Penilaian Realisasi & Staging Approval",
    primaryRoute: "/input-kpi",
    allowedRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
    primarySelector: '[data-tour="step-5-kpi-table"]',
    fallbackSelectors: [
      '[data-tour="step-6-staging-tabs"]',
      '[data-tour="step-5-header-filter"]',
      '[data-tour="nav--input-kpi"]',
      '[data-tour="sidebar-nav-container"]',
    ],
    preferredPlacement: "top",
    subTargets: [
      {
        label: "Input Realisasi Bulanan",
        selector: '[data-tour="step-5-kpi-table"]',
        route: "/input-kpi",
        summary: "Pengisian angka capaian aktual pada setiap parameter dan indikator kinerja.",
        points: [
          "Metode Hitung: Nilai otomatis diolah dengan metode SUM (total), AVG (rata-rata), atau LAST_VALUE.",
          "Kalkulasi Skor: Sistem otomatis membandingkan capaian dengan target dan menghitung skor bobot.",
        ],
      },
      {
        label: "Eviden & Bukti Kerja",
        selector: '[data-tour="step-5-kpi-table"]',
        route: "/input-kpi",
        summary: "Lampiran dokumen pembuktian atas angka realisasi yang diinput.",
        points: [
          "Upload Dokumen: Lampirkan file PDF, spreadsheet, foto, atau tautan bukti hasil kerja.",
          "Verifikasi Asesor: Penilai memeriksa keabsahan bukti sebelum menyetujui evaluasi.",
        ],
      },
      {
        label: "Tahapan Staging Approval",
        selector: '[data-tour="step-6-staging-tabs"]',
        route: "/input-kpi",
        summary: "Alur persetujuan bertingkat per stage dari pengisian hingga pengesahan final.",
        points: [
          "Draft: Lembar kerja sedang diisi oleh karyawan / penilai dan belum diajukan.",
          "In Review: Lembar kerja telah diajukan dan sedang diperiksa oleh Supervisor / Atasan.",
          "Revision: Lembar kerja dikembalikan ke penilai dengan catatan perbaikan jika ada koreksi.",
          "Approved & Final: Lembar kerja telah disahkan oleh Head of Department dan dikunci.",
        ],
      },
    ],
    fallbackNote:
      "Buka menu Penilaian KPI (/input-kpi) untuk mengisi realisasi bulanan, melampirkan bukti pendukung, dan memeriksa skor.",
  },
  {
    step: 8,
    code: "STEP 8 OF 8",
    title: "Laporan & Statistik Management Summary",
    primaryRoute: "/report",
    allowedRoles: ["ADMIN", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
    primarySelector: '[data-tour="step-7-report-tabs"]',
    fallbackSelectors: [
      '[data-tour="nav--report"]',
      '[data-tour="sidebar-nav-container"]',
    ],
    preferredPlacement: "bottom",
    subTargets: [
      {
        label: "Summary Rekapitulasi KPI",
        selector: '[data-tour="step-7-report-tabs"]',
        route: "/report",
        summary: "Tabel rekapitulasi nilai akhir, skor total, dan predikat kinerja seluruh karyawan.",
        points: [
          "Daftar Terpusat: Memeriksa capaian per divisi, jabatan, dan kategori kinerja.",
          "Pencarian & Filter: Filter berdasarkan periode aktif, unit operasional, atau grade kinerja.",
        ],
      },
      {
        label: "Statistik & Sebaran Grade",
        selector: '[data-tour="step-7-report-tabs"]',
        route: "/report",
        summary: "Analisis grafik performa departemen dan distribusi nilai organisasi.",
        points: [
          "Rata-rata Departemen: Membandingkan pencapaian kinerja antar departemen secara obyektif.",
          "Sebaran Grade: Grafik persentase karyawan dalam kategori kinerja unggul hingga evaluasi khusus.",
        ],
      },
    ],
    fallbackNote:
      "Buka menu Report untuk melihat rekapitulasi penilaian kinerja organisasi dan analisis statistik grade karyawan.",
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
    if (!desiredRoute) {
      setIsNavigating(false);
      return;
    }

    const [desiredBasePath] = desiredRoute.split("?");

    if (desiredBasePath && pathname !== desiredBasePath) {
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
