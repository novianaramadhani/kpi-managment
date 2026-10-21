import { db } from "@/db";
import {
  systemConfig,
  departments,
  jobLevels,
  employees,
  kpiPeriods,
  kpiTemplates,
  kpiCategories,
  kpiParameters,
  kpiBands,
  auditLogs,
} from "@/db/schema";
import { eq } from "drizzle-orm";

type BandDef = {
  label: string;
  op: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "BETWEEN" | "TEXT";
  min?: number;
  max?: number;
  score: number;
};

type ParamDef = {
  name: string;
  description?: string;
  weight: number;
  maxScore?: number;
  inputType: "PERCENTAGE" | "NUMBER" | "CURRENCY" | "MONTHLY_ACTUAL" | "QUALITATIVE";
  aggregation?: "AVERAGE" | "SUM" | "LAST_VALUE" | "RATIO";
  compareBasis?: "ACTUAL" | "ACHIEVEMENT";
  unit?: string;
  picRole?: "HEAD_DEPT" | "HR" | "HSE" | "SUPERINTENDENT";
  bands: BandDef[];
};

type CatDef = { name: string; weight: number; params: ParamDef[] };

export const deptTemplateDefinitions: {
  deptCode: string;
  deptName: string;
  templateName: string;
  categoryName: string;
  jobLevelCode: string;
  params: ParamDef[];
}[] = [
  // 1. PLANT
  {
    deptCode: "PLANT",
    deptName: "Plant",
    templateName: "Template Master KPI - Plant",
    categoryName: "FAKTOR KINERJA DEPARTEMEN PLANT",
    jobLevelCode: "STAFF",
    params: [
      {
        name: "Biaya Repair & Maintenance",
        description: "Realisasi biaya repair dan maintenance per volume produksi (Rp/Bcm)",
        weight: 0.35,
        inputType: "CURRENCY",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "Rp/Bcm",
        bands: [
          { label: "≤ Budget (Efisien)", op: "LTE", max: 0, score: 25 },
          { label: "Budget s/d +5%", op: "BETWEEN", min: 0, max: 5, score: 15 },
          { label: "> +5% Budget (Overbudget)", op: "GT", min: 5, score: 5 },
        ],
      },
      {
        name: "Tyre Cost",
        description: "Pengendalian biaya pemakaian ban unit operasional per volume (Rp/Bcm)",
        weight: 0.3,
        inputType: "CURRENCY",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "Rp/Bcm",
        bands: [
          { label: "≤ Budget (Efisien)", op: "LTE", max: 0, score: 25 },
          { label: "Budget s/d +5%", op: "BETWEEN", min: 0, max: 5, score: 15 },
          { label: "> +5% Budget (Overbudget)", op: "GT", min: 5, score: 5 },
        ],
      },
      {
        name: "Pencapaian MTBF (Mean Time Between Failure)",
        description: "Rata-rata interval jam kerja operasional unit sebelum terjadi breakdown",
        weight: 0.1,
        inputType: "NUMBER",
        aggregation: "AVERAGE",
        compareBasis: "ACHIEVEMENT",
        unit: "jam",
        bands: [
          { label: "≥ 100% Target MTBF", op: "GTE", min: 100, score: 25 },
          { label: "90% - 99% Target MTBF", op: "GTE", min: 90, score: 15 },
          { label: "< 90% Target MTBF", op: "LT", max: 90, score: 5 },
        ],
      },
      {
        name: "Pencapaian MTTR (Mean Time To Repair)",
        description: "Kecepatan waktu rata-rata perbaikan unit hingga siap operasi kembali",
        weight: 0.1,
        inputType: "NUMBER",
        aggregation: "AVERAGE",
        compareBasis: "ACHIEVEMENT",
        unit: "jam",
        bands: [
          { label: "≤ 100% Target MTTR (Cepat)", op: "LTE", max: 100, score: 25 },
          { label: "101% - 110% Target MTTR", op: "LTE", max: 110, score: 15 },
          { label: "> 110% Target MTTR (Lambat)", op: "GT", min: 110, score: 5 },
        ],
      },
      {
        name: "Pencapaian (SM) Schedule Maintenance (BS VS BUS)",
        description: "Realisasi pelaksanaan servis terjadwal dibanding rencana (Breakdown Schedule vs Unscheduled)",
        weight: 0.1,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 95%", op: "GTE", min: 95, score: 25 },
          { label: "90% - 94%", op: "GTE", min: 90, score: 15 },
          { label: "< 90%", op: "LT", max: 90, score: 5 },
        ],
      },
      {
        name: "G Safe Achievement",
        description: "Tingkat pemenuhan keselamatan kerja dan kepatuhan Golden Rules / G-Safe",
        weight: 0.05,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 100%", op: "GTE", min: 100, score: 25 },
          { label: "95% - 99%", op: "GTE", min: 95, score: 15 },
          { label: "< 95%", op: "LT", max: 95, score: 5 },
        ],
      },
    ],
  },

  // 2. PRODUKSI
  {
    deptCode: "PROD",
    deptName: "Produksi",
    templateName: "Template Master KPI - Produksi",
    categoryName: "FAKTOR KINERJA DEPARTEMEN PRODUKSI",
    jobLevelCode: "SPV",
    params: [
      {
        name: "Pty HD 785",
        description: "Produktivitas unit Haul Dump Komatsu HD 785 per jam operasi",
        weight: 0.2,
        inputType: "NUMBER",
        aggregation: "AVERAGE",
        compareBasis: "ACHIEVEMENT",
        unit: "Bcm/Jam",
        bands: [
          { label: "≥ 100% Target", op: "GTE", min: 100, score: 25 },
          { label: "90% - 99% Target", op: "GTE", min: 90, score: 15 },
          { label: "< 90% Target", op: "LT", max: 90, score: 5 },
        ],
      },
      {
        name: "Pty HD 465/773",
        description: "Produktivitas unit Haul Dump CAT 773 / HD 465 per jam operasi",
        weight: 0.2,
        inputType: "NUMBER",
        aggregation: "AVERAGE",
        compareBasis: "ACHIEVEMENT",
        unit: "Bcm/Jam",
        bands: [
          { label: "≥ 100% Target", op: "GTE", min: 100, score: 25 },
          { label: "90% - 99% Target", op: "GTE", min: 90, score: 15 },
          { label: "< 90% Target", op: "LT", max: 90, score: 5 },
        ],
      },
      {
        name: "Pty DT volvo",
        description: "Produktivitas dump truck Volvo per jam operasi",
        weight: 0.1,
        inputType: "NUMBER",
        aggregation: "AVERAGE",
        compareBasis: "ACHIEVEMENT",
        unit: "Bcm/Jam",
        bands: [
          { label: "≥ 100% Target", op: "GTE", min: 100, score: 25 },
          { label: "90% - 99% Target", op: "GTE", min: 90, score: 15 },
          { label: "< 90% Target", op: "LT", max: 90, score: 5 },
        ],
      },
      {
        name: "Performance Slippery terhadap jam Hujan (Utara & Selatan)",
        description: "Persentase durasi slippery jalan tambang terhadap total jam curah hujan",
        weight: 0.1,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≤ 10% (Sangat Baik)", op: "LTE", max: 10, score: 25 },
          { label: "11% - 20% (Baik)", op: "LTE", max: 20, score: 15 },
          { label: "> 20% (Kurang)", op: "GT", min: 20, score: 5 },
        ],
      },
      {
        name: "Fuel Ratio Pit Utara",
        description: "Rasio konsumsi bahan bakar per volume pemindahan tanah Pit Utara",
        weight: 0.075,
        inputType: "NUMBER",
        aggregation: "AVERAGE",
        compareBasis: "ACHIEVEMENT",
        unit: "Ltr/Bcm",
        bands: [
          { label: "≤ 100% Budget (Efisien)", op: "LTE", max: 100, score: 25 },
          { label: "101% - 105% Budget", op: "LTE", max: 105, score: 15 },
          { label: "> 105% Budget (Boros)", op: "GT", min: 105, score: 5 },
        ],
      },
      {
        name: "Fuel Ratio Pit Selatan",
        description: "Rasio konsumsi bahan bakar per volume pemindahan tanah Pit Selatan",
        weight: 0.075,
        inputType: "NUMBER",
        aggregation: "AVERAGE",
        compareBasis: "ACHIEVEMENT",
        unit: "Ltr/Bcm",
        bands: [
          { label: "≤ 100% Budget (Efisien)", op: "LTE", max: 100, score: 25 },
          { label: "101% - 105% Budget", op: "LTE", max: 105, score: 15 },
          { label: "> 105% Budget (Boros)", op: "GT", min: 105, score: 5 },
        ],
      },
      {
        name: "Join Survey Vs Truck Count",
        description: "Akurasi rekonsiliasi volume hasil joint survey topografi vs ritase truck count",
        weight: 0.1,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 98%", op: "GTE", min: 98, score: 25 },
          { label: "95% - 97%", op: "GTE", min: 95, score: 15 },
          { label: "< 95%", op: "LT", max: 95, score: 5 },
        ],
      },
      {
        name: "Tyre Lifetime",
        description: "Pencapaian umur pakai ban operasional tambang terhadap target standar umur jam",
        weight: 0.1,
        inputType: "NUMBER",
        aggregation: "AVERAGE",
        compareBasis: "ACHIEVEMENT",
        unit: "Jam",
        bands: [
          { label: "≥ 100% Target", op: "GTE", min: 100, score: 25 },
          { label: "90% - 99% Target", op: "GTE", min: 90, score: 15 },
          { label: "< 90% Target", op: "LT", max: 90, score: 5 },
        ],
      },
      {
        name: "G Safe Achievement",
        description: "Tingkat pemenuhan keselamatan kerja dan kepatuhan Golden Rules / G-Safe",
        weight: 0.05,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 100%", op: "GTE", min: 100, score: 25 },
          { label: "95% - 99%", op: "GTE", min: 95, score: 15 },
          { label: "< 95%", op: "LT", max: 95, score: 5 },
        ],
      },
    ],
  },

  // 3. ENGINEERING
  {
    deptCode: "ENG",
    deptName: "Engineering",
    templateName: "Template Master KPI - Engineering",
    categoryName: "FAKTOR KINERJA DEPARTEMEN ENGINEERING",
    jobLevelCode: "STAFF",
    params: [
      {
        name: "Join Survey Vs Truck Count",
        description: "Pencapaian rekonsiliasi volume joint survey terhadap truck count",
        weight: 0.2,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 98%", op: "GTE", min: 98, score: 25 },
          { label: "95% - 97%", op: "GTE", min: 95, score: 15 },
          { label: "< 95%", op: "LT", max: 95, score: 5 },
        ],
      },
      {
        name: "HRM Inspection and Evaluation",
        description: "Keteraturan inspeksi dan evaluasi High Risk Management bulanan",
        weight: 0.1,
        inputType: "NUMBER",
        aggregation: "AVERAGE",
        compareBasis: "ACHIEVEMENT",
        unit: "X",
        bands: [
          { label: "≥ 100% Target", op: "GTE", min: 100, score: 25 },
          { label: "80% - 99% Target", op: "GTE", min: 80, score: 15 },
          { label: "< 80% Target", op: "LT", max: 80, score: 5 },
        ],
      },
      {
        name: "Lead Time Invoice",
        description: "Kecepatan penerbitan dan penyelesaian dokumen penagihan invoice kerja",
        weight: 0.1,
        inputType: "NUMBER",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "Hari",
        bands: [
          { label: "≤ 3 Hari", op: "LTE", max: 3, score: 25 },
          { label: "4 - 7 Hari", op: "LTE", max: 7, score: 15 },
          { label: "> 7 Hari", op: "GT", min: 7, score: 5 },
        ],
      },
      {
        name: "Kesesuaian Distance terhadap Budget",
        description: "Deviasi jarak hauling aktual dibanding rencana desain tambang dan budget",
        weight: 0.1,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "95% - 105% (Sesuai)", op: "BETWEEN", min: 95, max: 105, score: 25 },
          { label: "90% - 94% / 106% - 110%", op: "BETWEEN", min: 90, max: 110, score: 15 },
          { label: "< 90% / > 110%", op: "LT", max: 90, score: 5 },
        ],
      },
      {
        name: "Fuel Ratio",
        description: "Kesesuaian rasio pemakaian bahan bakar terhadap anggaran perencanaan engineering",
        weight: 0.2,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACHIEVEMENT",
        unit: "%",
        bands: [
          { label: "≤ 100% Budget", op: "LTE", max: 100, score: 25 },
          { label: "101% - 105% Budget", op: "LTE", max: 105, score: 15 },
          { label: "> 105% Budget", op: "GT", min: 105, score: 5 },
        ],
      },
      {
        name: "Kesesuaian jumlah alat VS Budget",
        description: "Penyediaan alokasi unit armada kerja operasional terhadap perencanaan tambang",
        weight: 0.15,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 95%", op: "GTE", min: 95, score: 25 },
          { label: "90% - 94%", op: "GTE", min: 90, score: 15 },
          { label: "< 90%", op: "LT", max: 90, score: 5 },
        ],
      },
      {
        name: "Customer Complain",
        description: "Jumlah komplain atau teguran dari pihak owner/klien terkait hasil kerja teknis",
        weight: 0.1,
        inputType: "NUMBER",
        aggregation: "SUM",
        compareBasis: "ACTUAL",
        unit: "X",
        bands: [
          { label: "≤ 1 Komplain", op: "LTE", max: 1, score: 25 },
          { label: "2 - 3 Komplain", op: "LTE", max: 3, score: 15 },
          { label: "> 3 Komplain", op: "GT", min: 3, score: 5 },
        ],
      },
      {
        name: "G Safe Achievement",
        description: "Tingkat pemenuhan keselamatan kerja dan kepatuhan Golden Rules / G-Safe",
        weight: 0.05,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 100%", op: "GTE", min: 100, score: 25 },
          { label: "95% - 99%", op: "GTE", min: 95, score: 15 },
          { label: "< 95%", op: "LT", max: 95, score: 5 },
        ],
      },
    ],
  },

  // 4. HR (HUMAN RESOURCES)
  {
    deptCode: "HRD",
    deptName: "Human Resources",
    templateName: "Template Master KPI - Human Resources",
    categoryName: "FAKTOR KINERJA DEPARTEMEN HR",
    jobLevelCode: "STAFF",
    params: [
      {
        name: "Pemenuhan Karyawan",
        description: "Persentase pemenuhan manning power sesuai kebutuhan MPP",
        weight: 0.1,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 95%", op: "GTE", min: 95, score: 25 },
          { label: "90% - 94%", op: "GTE", min: 90, score: 15 },
          { label: "< 90%", op: "LT", max: 90, score: 5 },
        ],
      },
      {
        name: "Attendant Ratio (Tingkat kehadiran)",
        description: "Tingkat persentase kehadiran seluruh karyawan aktif (Target: 98%)",
        weight: 0.1,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 98%", op: "GTE", min: 98, score: 25 },
          { label: "95% - 97%", op: "GTE", min: 95, score: 15 },
          { label: "< 95%", op: "LT", max: 95, score: 5 },
        ],
      },
      {
        name: "Turn over Karyawan",
        description: "Persentase angka keluar masuk karyawan (Target: ≤ 3%)",
        weight: 0.1,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≤ 3%", op: "LTE", max: 3, score: 25 },
          { label: "3.1% - 5%", op: "LTE", max: 5, score: 15 },
          { label: "> 5%", op: "GT", min: 5, score: 5 },
        ],
      },
      {
        name: "Mengukur jumlah hari yang hilang karena ketidak hadiran karyawan",
        description: "Total akumulasi hari kerja yang hilang (absenteeism / lost work days)",
        weight: 0.1,
        inputType: "NUMBER",
        aggregation: "SUM",
        compareBasis: "ACTUAL",
        unit: "Hari",
        bands: [
          { label: "≤ 5 Hari", op: "LTE", max: 5, score: 25 },
          { label: "6 - 15 Hari", op: "LTE", max: 15, score: 15 },
          { label: "> 15 Hari", op: "GT", min: 15, score: 5 },
        ],
      },
      {
        name: "Upah dan Gaji",
        description: "Realisasi biaya penggajian karyawan per volume produksi (Rp/Bcm)",
        weight: 0.1,
        inputType: "NUMBER",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "Rp/Bcm",
        bands: [
          { label: "≤ Budget", op: "LTE", max: 0, score: 25 },
          { label: "Budget s/d +5%", op: "BETWEEN", min: 0, max: 5, score: 15 },
          { label: "> +5% Budget", op: "GT", min: 5, score: 5 },
        ],
      },
      {
        name: "Mine Permit Expired",
        description: "Jumlah kasus izin masuk tambang (mine permit / simper) yang kadaluarsa (Target: 0)",
        weight: 0.1,
        inputType: "NUMBER",
        aggregation: "SUM",
        compareBasis: "ACTUAL",
        unit: "Case",
        bands: [
          { label: "= 0 Case", op: "EQ", min: 0, score: 25 },
          { label: "1 - 2 Case", op: "BETWEEN", min: 1, max: 2, score: 10 },
          { label: "> 2 Case", op: "GT", min: 2, score: 0 },
        ],
      },
      {
        name: "Lead Time Payroll",
        description: "Ketepatan waktu pemrosesan payroll gaji bulanan (Target: Tanggal 4)",
        weight: 0.1,
        inputType: "NUMBER",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "Tanggal",
        bands: [
          { label: "≤ Tanggal 4", op: "LTE", max: 4, score: 25 },
          { label: "Tanggal 5", op: "EQ", min: 5, score: 15 },
          { label: "> Tanggal 5", op: "GT", min: 5, score: 5 },
        ],
      },
      {
        name: "Pemenuhan TNA Kompetensi Sertifikasi Safety",
        description: "Realisasi Training Needs Analysis untuk sertifikasi keselamatan kerja",
        weight: 0.1,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 95%", op: "GTE", min: 95, score: 25 },
          { label: "85% - 94%", op: "GTE", min: 85, score: 15 },
          { label: "< 85%", op: "LT", max: 85, score: 5 },
        ],
      },
      {
        name: "Pembinaan karyawan",
        description: "Penyelenggaraan program pembinaan dan konseling karyawan bermasalah",
        weight: 0.05,
        inputType: "NUMBER",
        aggregation: "SUM",
        compareBasis: "ACHIEVEMENT",
        unit: "Kegiatan",
        bands: [
          { label: "≥ 100% Target", op: "GTE", min: 100, score: 25 },
          { label: "80% - 99%", op: "GTE", min: 80, score: 15 },
          { label: "< 80%", op: "LT", max: 80, score: 5 },
        ],
      },
      {
        name: "Pemenuhan BPJS",
        description: "Pendaftaran dan pembayaran iuran kepesertaan BPJS Kesehatan & Ketenagakerjaan (Target: 100%)",
        weight: 0.05,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "= 100%", op: "GTE", min: 100, score: 25 },
          { label: "95% - 99%", op: "GTE", min: 95, score: 15 },
          { label: "< 95%", op: "LT", max: 95, score: 5 },
        ],
      },
      {
        name: "Pembuatan Memo terkait Regulasi/peraturan internal",
        description: "Penerbitan memo edaran dan sosialisasi kebijakan ketenagakerjaan internal",
        weight: 0.05,
        inputType: "NUMBER",
        aggregation: "SUM",
        compareBasis: "ACHIEVEMENT",
        unit: "Memo",
        bands: [
          { label: "≥ 100% Target", op: "GTE", min: 100, score: 25 },
          { label: "80% - 99%", op: "GTE", min: 80, score: 15 },
          { label: "< 80%", op: "LT", max: 80, score: 5 },
        ],
      },
      {
        name: "G Safe Achievement",
        description: "Tingkat pemenuhan keselamatan kerja dan kepatuhan Golden Rules / G-Safe",
        weight: 0.05,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 100%", op: "GTE", min: 100, score: 25 },
          { label: "95% - 99%", op: "GTE", min: 95, score: 15 },
          { label: "< 95%", op: "LT", max: 95, score: 5 },
        ],
      },
    ],
  },

  // 5. GA (GENERAL AFFAIRS)
  {
    deptCode: "GA",
    deptName: "General Affairs",
    templateName: "Template Master KPI - General Affairs",
    categoryName: "FAKTOR KINERJA DEPARTEMEN GA",
    jobLevelCode: "STAFF",
    params: [
      {
        name: "Survey Kepuasan Karyawan (Mess, Makan, Laundry, Transport, Infrastruktur)",
        description: "Indeks kepuasan fasilitas akomodasi mess, katering, laundry, sarana transport, dan infrastruktur",
        weight: 0.3,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "Hasil Survey",
        bands: [
          { label: "≥ 85% (Sangat Baik)", op: "GTE", min: 85, score: 25 },
          { label: "75% - 84% (Baik)", op: "GTE", min: 75, score: 20 },
          { label: "65% - 74% (Cukup)", op: "GTE", min: 65, score: 10 },
          { label: "< 65% (Kurang)", op: "LT", max: 65, score: 5 },
        ],
      },
      {
        name: "Lead time Penyelesaian Permasalahan / komplain",
        description: "Kecepatan penanganan fasilitas rusak atau keluhan layanan GA",
        weight: 0.2,
        inputType: "NUMBER",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "Hari",
        bands: [
          { label: "≤ 2 Hari", op: "LTE", max: 2, score: 25 },
          { label: "3 - 5 Hari", op: "LTE", max: 5, score: 15 },
          { label: "> 5 Hari", op: "GT", min: 5, score: 5 },
        ],
      },
      {
        name: "Tidak ada kehilangan Asset/barang (Security)",
        description: "Jumlah insiden kehilangan aset atau inventaris perusahaan (Target: 0 Kasus)",
        weight: 0.25,
        inputType: "NUMBER",
        aggregation: "SUM",
        compareBasis: "ACTUAL",
        unit: "Kasus",
        bands: [
          { label: "= 0 Kasus", op: "EQ", min: 0, score: 25 },
          { label: "1 Kasus", op: "EQ", min: 1, score: 10 },
          { label: "> 1 Kasus", op: "GT", min: 1, score: 0 },
        ],
      },
      {
        name: "Tidak ada Loss Time karena Demo/Strike",
        description: "Durasi jam operasional tambang yang terhenti akibat gejolak sosial / mogok kerja (Target: 0 Jam)",
        weight: 0.2,
        inputType: "NUMBER",
        aggregation: "SUM",
        compareBasis: "ACTUAL",
        unit: "Jam",
        bands: [
          { label: "= 0 Jam", op: "EQ", min: 0, score: 25 },
          { label: "1 - 4 Jam", op: "BETWEEN", min: 1, max: 4, score: 10 },
          { label: "> 4 Jam", op: "GT", min: 4, score: 0 },
        ],
      },
      {
        name: "G Safe Achievement",
        description: "Tingkat pemenuhan keselamatan kerja dan kepatuhan Golden Rules / G-Safe",
        weight: 0.05,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 100%", op: "GTE", min: 100, score: 25 },
          { label: "95% - 99%", op: "GTE", min: 95, score: 15 },
          { label: "< 95%", op: "LT", max: 95, score: 5 },
        ],
      },
    ],
  },

  // 6. LOGISTIC
  {
    deptCode: "LOG",
    deptName: "Logistik",
    templateName: "Template Master KPI - Logistik",
    categoryName: "FAKTOR KINERJA DEPARTEMEN LOGISTIC",
    jobLevelCode: "STAFF",
    params: [
      {
        name: "Lead time Pemenuhan Spare Parts",
        description: "Waktu pemenuhan permintaan suku cadang/spare part ke user mekanik",
        weight: 0.2,
        inputType: "NUMBER",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "hari",
        bands: [
          { label: "≤ 3 Hari", op: "LTE", max: 3, score: 25 },
          { label: "4 - 7 Hari", op: "LTE", max: 7, score: 15 },
          { label: "> 7 Hari", op: "GT", min: 7, score: 5 },
        ],
      },
      {
        name: "Inventory Value (SOH)",
        description: "Pengendalian nilai persediaan gudang Stock On Hand sesuai plafon anggaran",
        weight: 0.2,
        inputType: "CURRENCY",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "Rp",
        bands: [
          { label: "≤ Budget (Terkendali)", op: "LTE", max: 0, score: 25 },
          { label: "Budget s/d +5%", op: "BETWEEN", min: 0, max: 5, score: 15 },
          { label: "> +5% Budget", op: "GT", min: 5, score: 5 },
        ],
      },
      {
        name: "Discrepancy Fuel Stock",
        description: "Toleransi selisih pencatatan fisik stok BBM dibanding saldo sistem",
        weight: 0.15,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≤ 0.2%", op: "LTE", max: 0.2, score: 25 },
          { label: "0.21% - 0.5%", op: "LTE", max: 0.5, score: 15 },
          { label: "> 0.5%", op: "GT", min: 0.5, score: 5 },
        ],
      },
      {
        name: "Discrepancy Fuel Consumption",
        description: "Selisih pemakaian bahan bakar aktual dibanding angka pengeluaran tangki",
        weight: 0.15,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≤ 0.5%", op: "LTE", max: 0.5, score: 25 },
          { label: "0.51% - 1.0%", op: "LTE", max: 1.0, score: 15 },
          { label: "> 1.0%", op: "GT", min: 1.0, score: 5 },
        ],
      },
      {
        name: "Dead stock (90 days)",
        description: "Nilai suku cadang yang tidak bergerak lebih dari 90 hari (Target: ≤ Rp 500 Juta)",
        weight: 0.15,
        inputType: "CURRENCY",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "Rp",
        bands: [
          { label: "≤ 500 Jt", op: "LTE", max: 500000000, score: 25 },
          { label: "501 Jt - 750 Jt", op: "LTE", max: 750000000, score: 15 },
          { label: "> 750 Jt", op: "GT", min: 750000000, score: 5 },
        ],
      },
      {
        name: "Loss time refueling",
        description: "Waktu tunggu antrean pengisian bahan bakar unit hauling",
        weight: 0.1,
        inputType: "NUMBER",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "Jam",
        bands: [
          { label: "≤ 0.25 Jam (15 mnt)", op: "LTE", max: 0.25, score: 25 },
          { label: "0.26 - 0.5 Jam (30 mnt)", op: "LTE", max: 0.5, score: 15 },
          { label: "> 0.5 Jam", op: "GT", min: 0.5, score: 5 },
        ],
      },
      {
        name: "G Safe Achievement",
        description: "Tingkat pemenuhan keselamatan kerja dan kepatuhan Golden Rules / G-Safe",
        weight: 0.05,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 100%", op: "GTE", min: 100, score: 25 },
          { label: "95% - 99%", op: "GTE", min: 95, score: 15 },
          { label: "< 95%", op: "LT", max: 95, score: 5 },
        ],
      },
    ],
  },

  // 7. SAFETY
  {
    deptCode: "HSE",
    deptName: "Health Safety Environment",
    templateName: "Template Master KPI - Safety (HSE)",
    categoryName: "FAKTOR KINERJA DEPARTEMEN SAFETY",
    jobLevelCode: "STAFF",
    params: [
      {
        name: "Pecapaian Program Mandatory Owner (simama, sipapa,...)",
        description: "Kepatuhan implementasi regulasi dan sistem mandatory safety milik owner",
        weight: 0.2,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 100%", op: "GTE", min: 100, score: 25 },
          { label: "90% - 99%", op: "GTE", min: 90, score: 15 },
          { label: "< 90%", op: "LT", max: 90, score: 5 },
        ],
      },
      {
        name: "Pencapaian OPB",
        description: "Pencapaian Observasi Perilaku Berkeselamatan (OPB) pengawas tambang",
        weight: 0.2,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 95%", op: "GTE", min: 95, score: 25 },
          { label: "85% - 94%", op: "GTE", min: 85, score: 15 },
          { label: "< 85%", op: "LT", max: 85, score: 5 },
        ],
      },
      {
        name: "Pemenuhan TNA Kompetensi Sertifikasi Safety",
        description: "Realisasi sertifikasi kompetensi K3 (POP, POM, POU, First Aid, Fireman)",
        weight: 0.2,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 95%", op: "GTE", min: 95, score: 25 },
          { label: "85% - 94%", op: "GTE", min: 85, score: 15 },
          { label: "< 85%", op: "LT", max: 85, score: 5 },
        ],
      },
      {
        name: "No Stand by karena Expired Commisioning",
        description: "Jumlah jam unit berhenti beroperasi akibat keterlambatan masa komisioning (Target: 0 Jam)",
        weight: 0.15,
        inputType: "NUMBER",
        aggregation: "SUM",
        compareBasis: "ACTUAL",
        unit: "Jam",
        bands: [
          { label: "= 0 Jam", op: "EQ", min: 0, score: 25 },
          { label: "1 - 5 Jam", op: "BETWEEN", min: 1, max: 5, score: 10 },
          { label: "> 5 Jam", op: "GT", min: 5, score: 0 },
        ],
      },
      {
        name: "Pencapaian Audit",
        description: "Skor audit SMKP (Sistem Manajemen Keselamatan Pertambangan) & audit internal",
        weight: 0.2,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 90%", op: "GTE", min: 90, score: 25 },
          { label: "80% - 89%", op: "GTE", min: 80, score: 15 },
          { label: "< 80%", op: "LT", max: 80, score: 5 },
        ],
      },
      {
        name: "G Safe Achievement (All Dept)",
        description: "Tingkat pemenuhan Golden Rules & G-Safe seluruh departemen di site",
        weight: 0.05,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 100%", op: "GTE", min: 100, score: 25 },
          { label: "95% - 99%", op: "GTE", min: 95, score: 15 },
          { label: "< 95%", op: "LT", max: 95, score: 5 },
        ],
      },
    ],
  },

  // 8. TRAINING
  {
    deptCode: "TRN",
    deptName: "Training",
    templateName: "Template Master KPI - Training",
    categoryName: "FAKTOR KINERJA DEPARTEMEN TRAINING",
    jobLevelCode: "STAFF",
    params: [
      {
        name: "Mentoring Operator di bawah 2 thn",
        description: "Jumlah operator masa kerja di bawah 2 tahun yang lulus program pendampingan (Target: 620 orang)",
        weight: 0.25,
        inputType: "NUMBER",
        aggregation: "SUM",
        compareBasis: "ACHIEVEMENT",
        unit: "orang",
        bands: [
          { label: "≥ 100% (≥ 620 org)", op: "GTE", min: 100, score: 25 },
          { label: "90% - 99%", op: "GTE", min: 90, score: 15 },
          { label: "< 90%", op: "LT", max: 90, score: 5 },
        ],
      },
      {
        name: "Standardisasi Metode Loading 45 Derajat",
        description: "Sertifikasi operator dalam penerapan metode loading material 45 derajat (Target: 348 orang)",
        weight: 0.25,
        inputType: "NUMBER",
        aggregation: "SUM",
        compareBasis: "ACHIEVEMENT",
        unit: "orang",
        bands: [
          { label: "≥ 100% (≥ 348 org)", op: "GTE", min: 100, score: 25 },
          { label: "90% - 99%", op: "GTE", min: 90, score: 15 },
          { label: "< 90%", op: "LT", max: 90, score: 5 },
        ],
      },
      {
        name: "Pemenuhan Jadwal Training Tahunan",
        description: "Persentase realisasi kalender pelatihan tahunan sesuai jadwal (Target: 90%)",
        weight: 0.25,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACHIEVEMENT",
        unit: "%",
        bands: [
          { label: "≥ 90%", op: "GTE", min: 90, score: 25 },
          { label: "80% - 89%", op: "GTE", min: 80, score: 15 },
          { label: "< 80%", op: "LT", max: 80, score: 5 },
        ],
      },
      {
        name: "Refresh Induksi pasca Cuti & Simulator",
        description: "Realisasi penyegaran induksi dan uji simulator bagi operator pasca cuti kerja",
        weight: 0.2,
        inputType: "NUMBER",
        aggregation: "SUM",
        compareBasis: "ACHIEVEMENT",
        unit: "orang",
        bands: [
          { label: "≥ 100% Target", op: "GTE", min: 100, score: 25 },
          { label: "90% - 99%", op: "GTE", min: 90, score: 15 },
          { label: "< 90%", op: "LT", max: 90, score: 5 },
        ],
      },
      {
        name: "G Safe Achievement",
        description: "Tingkat pemenuhan keselamatan kerja dan kepatuhan Golden Rules / G-Safe",
        weight: 0.05,
        inputType: "PERCENTAGE",
        aggregation: "AVERAGE",
        compareBasis: "ACTUAL",
        unit: "%",
        bands: [
          { label: "≥ 100%", op: "GTE", min: 100, score: 25 },
          { label: "95% - 99%", op: "GTE", min: 95, score: 15 },
          { label: "< 95%", op: "LT", max: 95, score: 5 },
        ],
      },
    ],
  },
];

export async function seedDemoData() {
  const existing = await db.select().from(departments);
  if (existing.length) return;

  await db
    .insert(systemConfig)
    .values([
      { key: "system_clock_date", value: "2025-12-15", description: "Tanggal sistem (di-set admin)" },
      { key: "company_name", value: "PT Mining Industry Persada", description: "Nama perusahaan" },
    ])
    .onConflictDoNothing();

  // Create Job Levels
  const [lNonStaff, lStaff, lSpv, lSupt, lMgr] = await db
    .insert(jobLevels)
    .values([
      { code: "NON_STAFF", name: "Non Staff", rank: 0, appraiserLevel: "Staff, Supervisor", hierarchyStatus: "Active" },
      { code: "STAFF", name: "Staff", rank: 1, appraiserLevel: "Supervisor, Superintendent", hierarchyStatus: "Active" },
      { code: "SPV", name: "Supervisor", rank: 2, appraiserLevel: "Superintendent", hierarchyStatus: "Active" },
      { code: "SUPT", name: "Superintendent", rank: 3, appraiserLevel: "Manager", hierarchyStatus: "Active" },
      { code: "MGR", name: "Manager", rank: 4, appraiserLevel: "Head Department / General Manager", hierarchyStatus: "Active" },
    ])
    .returning();

  // Create Departments and Department Templates
  for (const def of deptTemplateDefinitions) {
    const [dept] = await db
      .insert(departments)
      .values({ code: def.deptCode, name: def.deptName })
      .returning();

    const [tpl] = await db
      .insert(kpiTemplates)
      .values({
        name: def.templateName,
        departmentId: dept.id,
        jobLevelId: lStaff.id,
        totalWeight: "1.0000",
        isActive: true,
        version: 1,
      })
      .returning();

    const [cat] = await db
      .insert(kpiCategories)
      .values({
        templateId: tpl.id,
        name: def.categoryName,
        weight: "1.0000",
        sortOrder: 0,
      })
      .returning();

    let sortOrder = 0;
    for (const p of def.params) {
      const [param] = await db
        .insert(kpiParameters)
        .values({
          categoryId: cat.id,
          name: p.name,
          description: p.description ?? null,
          weight: String(p.weight),
          maxScore: String(p.maxScore ?? 25),
          inputType: p.inputType,
          aggregation: p.aggregation ?? "AVERAGE",
          compareBasis: p.compareBasis ?? "ACTUAL",
          unit: p.unit ?? null,
          picRole: p.picRole ?? "HEAD_DEPT",
          isMonthly: p.inputType === "MONTHLY_ACTUAL",
          sortOrder: sortOrder++,
        })
        .returning();

      if (p.bands.length) {
        await db.insert(kpiBands).values(
          p.bands.map((b, idx) => ({
            parameterId: param.id,
            label: b.label,
            operator: b.op,
            minValue: b.min !== undefined ? String(b.min) : null,
            maxValue: b.max !== undefined ? String(b.max) : null,
            score: String(b.score),
            sortOrder: idx,
          }))
        );
      }
    }
  }

  await db.insert(kpiPeriods).values({
    name: "KPI Tahun 2025",
    year: 2025,
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    evaluationDate: "2025-12-31",
    inputStartMonth: 11,
    cutoffMonth: 12,
    minTenureMonths: 6,
    status: "ACTIVE",
  });

  await db.insert(auditLogs).values({ entity: "system", entityId: null, action: "SEED_DEMO", actor: "system" });
}
