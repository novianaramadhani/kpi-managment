// Katalog Lengkap Role-Based Access Control (RBAC) Sistem KPI

export interface SystemPermissionItem {
  code: string;
  name: string;
  description: string;
  module: RbacModuleKey;
  defaultRoles: string[];
}

export type RbacModuleKey =
  | "DASHBOARD"
  | "MASTER_DATA"
  | "MASTER_PARAM"
  | "TEMPLATE_KPI"
  | "INPUT_ASSESSMENT"
  | "REVIEW_APPROVAL"
  | "REPORT_ANALYTICS"
  | "SYSTEM_CONFIG";

export interface RbacModuleMeta {
  key: RbacModuleKey;
  label: string;
  description: string;
  iconName: string;
  colorClass: string;
}

export const RBAC_MODULES: RbacModuleMeta[] = [
  {
    key: "DASHBOARD",
    label: "Dashboard & Analytics",
    description: "Akses visualisasi grafik, ringkasan skor dan tren kinerja",
    iconName: "dashboard",
    colorClass: "text-sky-600 bg-sky-50 border-sky-200",
  },
  {
    key: "MASTER_DATA",
    label: "Master Data & Organisasi",
    description: "Pengelolaan data karyawan, departemen, job level, dan unit kerja",
    iconName: "database",
    colorClass: "text-teal-600 bg-teal-50 border-teal-200",
  },
  {
    key: "MASTER_PARAM",
    label: "Kamus Indikator KPI",
    description: "Pengaturan indikator, formula, satuan ukur, dan agregasi penilaian",
    iconName: "parameter",
    colorClass: "text-cyan-600 bg-cyan-50 border-cyan-200",
  },
  {
    key: "TEMPLATE_KPI",
    label: "Template & Penugasan KPI",
    description: "Pembuatan template matriks penilaian dan penugasan ke posisi/karyawan",
    iconName: "template",
    colorClass: "text-purple-600 bg-purple-50 border-purple-200",
  },
  {
    key: "INPUT_ASSESSMENT",
    label: "Input Penilaian KPI",
    description: "Pengisian realisasi capaian bulanan, bukti dukung, dan submit",
    iconName: "pencil",
    colorClass: "text-blue-600 bg-blue-50 border-blue-200",
  },
  {
    key: "REVIEW_APPROVAL",
    label: "Review & Approval",
    description: "Verifikasi formulir penilaian, persetujuan berjenjang, dan revisi",
    iconName: "check-badge",
    colorClass: "text-amber-600 bg-amber-50 border-amber-200",
  },
  {
    key: "REPORT_ANALYTICS",
    label: "Laporan & Ekspor",
    description: "Rekapitulasi pencapaian nilai KPI, ekspor Excel, dan cetak form",
    iconName: "report",
    colorClass: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  {
    key: "SYSTEM_CONFIG",
    label: "Pengaturan & Hak Akses",
    description: "Periode evaluasi, sinkronisasi Odoo ERP, log audit, dan otorisasi",
    iconName: "settings",
    colorClass: "text-slate-600 bg-slate-50 border-slate-200",
  },
];

export const SYSTEM_PERMISSIONS: SystemPermissionItem[] = [
  // 1. DASHBOARD
  {
    code: "dashboard.view_self",
    name: "Lihat Dashboard Pribadi",
    description: "Mengakses dashboard ringkasan skor dan grafik capaian diri sendiri",
    module: "DASHBOARD",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
  },
  {
    code: "dashboard.view_team",
    name: "Lihat Dashboard Tim",
    description: "Mengakses ringkasan skor dan grafik tim bawahan / departemen",
    module: "DASHBOARD",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT", "PENILAI"],
  },
  {
    code: "dashboard.view_company",
    name: "Lihat Dashboard Perusahaan",
    description: "Mengakses ringkasan analitik dan capaian seluruh unit perusahaan",
    module: "DASHBOARD",
    defaultRoles: ["ADMIN", "HR", "MANAGER"],
  },

  // 2. MASTER DATA & ORGANISASI
  {
    code: "master.employee.view",
    name: "Lihat Data Karyawan",
    description: "Melihat daftar master karyawan, NIK, jabatan, dan penempatan",
    module: "MASTER_DATA",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT"],
  },
  {
    code: "master.employee.create",
    name: "Tambah Karyawan Baru",
    description: "Mendaftarkan profil dan NIK karyawan baru ke dalam sistem",
    module: "MASTER_DATA",
    defaultRoles: ["ADMIN", "HR"],
  },
  {
    code: "master.employee.edit",
    name: "Ubah Data Karyawan",
    description: "Mengedit profil, jabatan, penempatan, dan atasan karyawan",
    module: "MASTER_DATA",
    defaultRoles: ["ADMIN", "HR"],
  },
  {
    code: "master.employee.delete",
    name: "Hapus / Nonaktifkan Karyawan",
    description: "Menghapus atau mengubah status keaktifan akun karyawan",
    module: "MASTER_DATA",
    defaultRoles: ["ADMIN", "HR"],
  },
  {
    code: "master.employee.excel",
    name: "Impor & Ekspor Excel Karyawan",
    description: "Melakukan import data karyawan massal dan ekspor template",
    module: "MASTER_DATA",
    defaultRoles: ["ADMIN", "HR"],
  },
  {
    code: "master.employee.reset_password",
    name: "Reset Kata Sandi Karyawan",
    description: "Mereset kata sandi akun karyawan ke default (NIK)",
    module: "MASTER_DATA",
    defaultRoles: ["ADMIN", "HR"],
  },
  {
    code: "master.department.manage",
    name: "Kelola Master Departemen",
    description: "Menambah, mengedit departemen serta menentukan Head & Manager",
    module: "MASTER_DATA",
    defaultRoles: ["ADMIN", "HR"],
  },
  {
    code: "master.job_level.manage",
    name: "Kelola Master Job Level",
    description: "Mengatur tingkatan golongan, hirarki eselon, dan pangkat",
    module: "MASTER_DATA",
    defaultRoles: ["ADMIN", "HR"],
  },
  {
    code: "master.operating_unit.manage",
    name: "Kelola Operating Unit (Sites)",
    description: "Mengatur unit kerja operasional HO, Site AKP, dan Site GAM",
    module: "MASTER_DATA",
    defaultRoles: ["ADMIN", "HR"],
  },
  {
    code: "master.approval_hierarchy.manage",
    name: "Kelola Hirarki Penilai",
    description: "Mengatur pemetaan atasan penilai langsung (Appraiser 1 & 2)",
    module: "MASTER_DATA",
    defaultRoles: ["ADMIN", "HR"],
  },

  // 3. KAMUS INDIKATOR KPI
  {
    code: "parameter.view",
    name: "Lihat Kamus Indikator",
    description: "Melihat daftar indikator KPI, satuan ukur, dan jenis input",
    module: "MASTER_PARAM",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT"],
  },
  {
    code: "parameter.create",
    name: "Buat Parameter Baru",
    description: "Menambahkan parameter indikator KPI baru ke dalam kamus",
    module: "MASTER_PARAM",
    defaultRoles: ["ADMIN", "HR"],
  },
  {
    code: "parameter.edit",
    name: "Ubah Parameter & Formula",
    description: "Mengubah target standar, formula, dan agregasi indikator",
    module: "MASTER_PARAM",
    defaultRoles: ["ADMIN", "HR"],
  },
  {
    code: "parameter.delete",
    name: "Hapus Parameter Indikator",
    description: "Menonaktifkan atau menghapus indikator KPI dari kamus",
    module: "MASTER_PARAM",
    defaultRoles: ["ADMIN", "HR"],
  },

  // 4. TEMPLATE & PENUGASAN KPI
  {
    code: "template.view",
    name: "Lihat Template KPI",
    description: "Melihat daftar matriks template form penilaian yang tersedia",
    module: "TEMPLATE_KPI",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT"],
  },
  {
    code: "template.create",
    name: "Rancang Template Baru",
    description: "Membuat rancangan template baru dengan komposisi kategori",
    module: "TEMPLATE_KPI",
    defaultRoles: ["ADMIN", "HR"],
  },
  {
    code: "template.edit",
    name: "Edit Matriks & Bobot Template",
    description: "Menyesuaikan bobot persentase, kriteria, dan item indikator",
    module: "TEMPLATE_KPI",
    defaultRoles: ["ADMIN", "HR"],
  },
  {
    code: "template.delete",
    name: "Hapus Template KPI",
    description: "Menghapus form template yang sudah tidak digunakan",
    module: "TEMPLATE_KPI",
    defaultRoles: ["ADMIN", "HR"],
  },
  {
    code: "template.assign",
    name: "Penugasan (Assignment) Template",
    description: "Menugaskan template form KPI ke posisi jabatan atau karyawan",
    module: "TEMPLATE_KPI",
    defaultRoles: ["ADMIN", "HR"],
  },

  // 5. INPUT PENILAIAN KPI
  {
    code: "assessment.view",
    name: "Lihat Daftar Penilaian Bulanan",
    description: "Mengakses daftar form penilaian kinerja karyawan",
    module: "INPUT_ASSESSMENT",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
  },
  {
    code: "assessment.input_self",
    name: "Input Capaian Realisasi Pribadi",
    description: "Mengisi angka aktual bulanan untuk KPI diri sendiri",
    module: "INPUT_ASSESSMENT",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
  },
  {
    code: "assessment.input_team",
    name: "Input & Evaluasi Capaian Bawahan",
    description: "Mengisi dan mengoreksi capaian indikator anggota tim bawahan",
    module: "INPUT_ASSESSMENT",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT", "PENILAI"],
  },
  {
    code: "assessment.evidence",
    name: "Unggah Bukti Dukung (Evidence)",
    description: "Mengunggah berkas bukti pendukung capaian KPI bulanan",
    module: "INPUT_ASSESSMENT",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
  },
  {
    code: "assessment.submit",
    name: "Ajukan Penilaian (Submit)",
    description: "Mengirimkan formulir penilaian ke tahap peninjauan atasan",
    module: "INPUT_ASSESSMENT",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
  },

  // 6. REVIEW & APPROVAL
  {
    code: "review.view",
    name: "Akses Antrean Review & Approval",
    description: "Melihat daftar penilaian masuk yang menunggu persetujuan",
    module: "REVIEW_APPROVAL",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT"],
  },
  {
    code: "review.inspect",
    name: "Pratinjau Form Review Lengkap",
    description: "Membuka modal detail verifikasi matriks capaian indikator",
    module: "REVIEW_APPROVAL",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT"],
  },
  {
    code: "review.edit_score",
    name: "Koreksi Nilai Saat Review",
    description: "Melakukan koreksi angka realisasi sebelum memberikan approval",
    module: "REVIEW_APPROVAL",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT"],
  },
  {
    code: "approval.approve",
    name: "Setujui & Teruskan (Approve)",
    description: "Menyetujui penilaian dan meneruskan ke tahapan persetujuan berikutnya",
    module: "REVIEW_APPROVAL",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT"],
  },
  {
    code: "approval.reject",
    name: "Kembalikan (Revisi / Return)",
    description: "Mengembalikan form penilaian dengan catatan perbaikan",
    module: "REVIEW_APPROVAL",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT"],
  },

  // 7. LAPORAN & EKSPOR
  {
    code: "report.view_self",
    name: "Lihat Rekap Nilai Pribadi",
    description: "Melihat rekapitulasi nilai dan pencapaian tahunan diri sendiri",
    module: "REPORT_ANALYTICS",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
  },
  {
    code: "report.view_team",
    name: "Lihat Rekap Nilai Tim / Dept",
    description: "Melihat laporan rekapitulasi penilaian anggota departemen",
    module: "REPORT_ANALYTICS",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT"],
  },
  {
    code: "report.view_company",
    name: "Lihat Rekap Nilai Seluruh Perusahaan",
    description: "Melihat laporan rekapitulasi penilaian seluruh karyawan perusahaan",
    module: "REPORT_ANALYTICS",
    defaultRoles: ["ADMIN", "HR"],
  },
  {
    code: "report.export_excel",
    name: "Ekspor Rekapitulasi ke Excel",
    description: "Mengunduh lembar kerja rekapitulasi nilai KPI format Excel",
    module: "REPORT_ANALYTICS",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT"],
  },
  {
    code: "report.print_form",
    name: "Cetak / Print Form Evaluasi",
    description: "Mencetak formulir lembar penilaian tahunan per karyawan",
    module: "REPORT_ANALYTICS",
    defaultRoles: ["ADMIN", "HR", "MANAGER", "HEAD_DEPT", "PENILAI", "KARYAWAN"],
  },

  // 8. PENGATURAN & HAK AKSES
  {
    code: "period.manage",
    name: "Kelola Periode & Jadwal KPI",
    description: "Membuka/menutup periode penilaian dan batas waktu (cut-off)",
    module: "SYSTEM_CONFIG",
    defaultRoles: ["ADMIN", "HR"],
  },
  {
    code: "system.config",
    name: "Konfigurasi Sistem & Odoo",
    description: "Mengatur parameter sistem, tanggal simulasi, dan integrasi ERP",
    module: "SYSTEM_CONFIG",
    defaultRoles: ["ADMIN"],
  },
  {
    code: "audit.view",
    name: "Lihat Jejak Audit (Audit Trail)",
    description: "Memantau catatan riwayat aktivitas dan perubahan data sistem",
    module: "SYSTEM_CONFIG",
    defaultRoles: ["ADMIN"],
  },
  {
    code: "rbac.manage",
    name: "Kelola Otoritas Hak Akses (RBAC)",
    description: "Mengatur role, hak akses khusus, dan checklist perizinan modul",
    module: "SYSTEM_CONFIG",
    defaultRoles: ["ADMIN"],
  },
];

/**
 * Mendapatkan daftar kode permission default untuk suatu role
 */
export function getDefaultPermissionsForRole(role: string): string[] {
  const normalizedRole = role.toUpperCase();
  if (normalizedRole === "ADMIN" || normalizedRole === "SUPERADMIN") {
    // Admin mendapatkan semua izin secara default
    return SYSTEM_PERMISSIONS.map((p) => p.code);
  }

  return SYSTEM_PERMISSIONS.filter((p) => p.defaultRoles.includes(normalizedRole)).map(
    (p) => p.code
  );
}

/**
 * Mengelompokkan seluruh permission berdasarkan modul
 */
export function getPermissionsGroupedByModule(): Record<
  RbacModuleKey,
  SystemPermissionItem[]
> {
  const grouped = {} as Record<RbacModuleKey, SystemPermissionItem[]>;
  for (const m of RBAC_MODULES) {
    grouped[m.key] = [];
  }
  for (const p of SYSTEM_PERMISSIONS) {
    if (grouped[p.module]) {
      grouped[p.module].push(p);
    }
  }
  return grouped;
}
