-- =============================================================================
-- Migration: KPI Formula Engine - Phase 1
-- Tanggal: 2026-09-30
-- Deskripsi: Tambah tabel kpi_calculation_rules, appraisal_calculation_logs,
--            dan kolom calculation_rule_id di kpi_parameters.
--            Semua nullable / additive — tidak ada breaking change ke data lama.
-- =============================================================================

-- 1. ENUM baru
DO $$ BEGIN
  CREATE TYPE calc_type AS ENUM ('ACHIEVEMENT', 'AGGREGATION', 'WEIGHTING', 'REWARD');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE calc_direction AS ENUM ('NORMAL', 'INVERSE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE rule_status AS ENUM ('ACTIVE', 'DEPRECATED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE input_source AS ENUM ('MANUAL_INPUT', 'HR_ATTENDANCE', 'INVENTORY', 'FINANCE', 'KPI_TEMPLATE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Tabel kpi_calculation_rules
CREATE TABLE IF NOT EXISTS kpi_calculation_rules (
  id                 SERIAL PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  description        TEXT,
  calculation_type   calc_type NOT NULL,
  direction          calc_direction,
  aggregation_method aggregation_method,
  formula_config     JSONB,
  input_sources      JSONB DEFAULT '{"actual":"MANUAL_INPUT","target":"KPI_TEMPLATE"}'::jsonb,
  version            INTEGER NOT NULL DEFAULT 1,
  effective_date     DATE NOT NULL,
  expires_date       DATE,
  status             rule_status NOT NULL DEFAULT 'ACTIVE',
  notes              TEXT,
  created_by         TEXT DEFAULT 'system',
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calc_rule_code ON kpi_calculation_rules(code);
CREATE INDEX IF NOT EXISTS idx_calc_rule_type_status ON kpi_calculation_rules(calculation_type, status);

-- 3. Tambah kolom calculation_rule_id ke kpi_parameters (nullable, no breaking change)
ALTER TABLE kpi_parameters
  ADD COLUMN IF NOT EXISTS calculation_rule_id INTEGER REFERENCES kpi_calculation_rules(id) ON DELETE SET NULL;

-- 4. Tabel appraisal_calculation_logs
CREATE TABLE IF NOT EXISTS appraisal_calculation_logs (
  id                         SERIAL PRIMARY KEY,
  appraisal_item_id          INTEGER NOT NULL REFERENCES appraisal_items(id) ON DELETE CASCADE,
  appraisal_monthly_value_id INTEGER REFERENCES appraisal_monthly_values(id) ON DELETE CASCADE,
  month                      INTEGER,          -- 1..12; NULL = annual
  period_year                INTEGER NOT NULL,
  calculation_rule_id        INTEGER REFERENCES kpi_calculation_rules(id) ON DELETE SET NULL,
  calculation_rule_code      TEXT,
  -- Input snapshot
  target                     NUMERIC(20, 4),
  actual                     NUMERIC(20, 4),
  indicator_weight           NUMERIC(6, 4),
  category_weight            NUMERIC(6, 4),
  max_score                  NUMERIC(8, 2),
  -- Hasil per tahap
  achievement_pct            NUMERIC(10, 4),
  matched_band_label         TEXT,
  score                      NUMERIC(8, 2),
  final_score_fraction       NUMERIC(10, 6),
  final_score_pct            NUMERIC(8, 4),
  -- Full trace untuk UI
  trace_json                 JSONB,
  calculated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  calculated_by              TEXT DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_calc_log_item  ON appraisal_calculation_logs(appraisal_item_id);
CREATE INDEX IF NOT EXISTS idx_calc_log_month ON appraisal_calculation_logs(appraisal_item_id, month);
CREATE INDEX IF NOT EXISTS idx_calc_log_year  ON appraisal_calculation_logs(period_year);

-- =============================================================================
-- SEED DATA: 7 Formula Standar
-- Memindahkan logika scoring.ts ke database agar bisa dilacak dan divisioning
-- =============================================================================

INSERT INTO kpi_calculation_rules
  (code, name, description, calculation_type, direction, aggregation_method,
   formula_config, input_sources, version, effective_date, status, notes)
VALUES

('ACH-NORMAL-V1', 'Achievement Normal',
 'Persentase capaian: Actual / Target × 100. Semakin tinggi aktual semakin baik.',
 'ACHIEVEMENT', 'NORMAL', NULL,
 '{"type":"ACHIEVEMENT","direction":"NORMAL","numerator":"actual","denominator":"target","multiplier":100,"output":"achievement_pct","edgeCases":{"target_zero_actual_zero":"100","target_zero_actual_positive":"NA"}}'::jsonb,
 '{"actual":"MANUAL_INPUT","target":"KPI_TEMPLATE","employee":"HR_EMPLOYEE","period":"KPI_PERIOD"}'::jsonb,
 1, '2025-01-01', 'ACTIVE',
 'Formula dasar indikator normal. Sumber: scoring.ts calculateKpiScore compareBasis=ACHIEVEMENT direction=NORMAL.'),

('ACH-INVERSE-V1', 'Achievement Inverse',
 'Persentase capaian untuk indikator semakin kecil semakin baik (deadstock, komplain, SP). Formula: Target / Actual × 100.',
 'ACHIEVEMENT', 'INVERSE', NULL,
 '{"type":"ACHIEVEMENT","direction":"INVERSE","numerator":"target","denominator":"actual","multiplier":100,"output":"achievement_pct","edgeCases":{"actual_zero_or_negative":"200"}}'::jsonb,
 '{"actual":"MANUAL_INPUT","target":"KPI_TEMPLATE","employee":"HR_EMPLOYEE","period":"KPI_PERIOD"}'::jsonb,
 1, '2025-01-01', 'ACTIVE',
 'Dipakai untuk: Rasio Deadstock, Jumlah Komplain, Surat Peringatan, Loss. Sumber: scoring.ts isInverseKpi.'),

('AGG-AVG-V1', 'Aggregasi Rata-rata (Average)',
 'Nilai tahunan = rata-rata bulan yang terisi. Pembagi = jumlah bulan terisi (prorata, bukan 12).',
 'AGGREGATION', NULL, 'AVERAGE',
 '{"type":"AGGREGATION","method":"AVERAGE","formula":"sum(actuals) / count(filled_months)","output":"annual_actual"}'::jsonb,
 '{"actual":"MANUAL_INPUT","target":"KPI_TEMPLATE"}'::jsonb,
 1, '2025-01-01', 'ACTIVE',
 'Default aggregation. Prorata otomatis jika karyawan baru. Sumber: scoring.ts aggregateMonthly AVERAGE.'),

('AGG-SUM-V1', 'Aggregasi Total Kumulatif (Sum)',
 'Nilai tahunan = akumulasi semua aktual bulanan. Untuk target volume kumulatif.',
 'AGGREGATION', NULL, 'SUM',
 '{"type":"AGGREGATION","method":"SUM","formula":"sum(actuals)","output":"annual_actual"}'::jsonb,
 '{"actual":"MANUAL_INPUT","target":"KPI_TEMPLATE"}'::jsonb,
 1, '2025-01-01', 'ACTIVE',
 'Dipakai untuk: Total Omzet, Total Unit Closing. Sumber: scoring.ts aggregateMonthly SUM.'),

('AGG-LASTVAL-V1', 'Aggregasi Nilai Terakhir (Last Value)',
 'Nilai tahunan = aktual bulan aktif terakhir.',
 'AGGREGATION', NULL, 'LAST_VALUE',
 '{"type":"AGGREGATION","method":"LAST_VALUE","formula":"actuals[last_filled_month]","output":"annual_actual"}'::jsonb,
 '{"actual":"MANUAL_INPUT","target":"KPI_TEMPLATE"}'::jsonb,
 1, '2025-01-01', 'ACTIVE',
 'Dipakai untuk: Saldo Stok Akhir, SOP terkini. Sumber: scoring.ts aggregateMonthly LAST_VALUE.'),

('AGG-RATIO-V1', 'Aggregasi Rasio Kumulatif (Ratio)',
 'Nilai tahunan = (total aktual / total target) × 100. Untuk efisiensi dan penyerapan.',
 'AGGREGATION', NULL, 'RATIO',
 '{"type":"AGGREGATION","method":"RATIO","formula":"(sum(actuals) / sum(targets)) * 100","output":"annual_actual"}'::jsonb,
 '{"actual":"MANUAL_INPUT","target":"KPI_TEMPLATE"}'::jsonb,
 1, '2025-01-01', 'ACTIVE',
 'Dipakai untuk: Efisiensi Biaya, Penyerapan Anggaran. Sumber: scoring.ts aggregateMonthly RATIO.'),

('WGT-CONTRIB-V1', 'Final Contribution (Weighting)',
 'Kontribusi final per indikator ke skor total. Formula: (Score / MaxScore) × Bobot Indikator × Bobot Kategori.',
 'WEIGHTING', NULL, NULL,
 '{"type":"WEIGHTING","formula":"(score / max_score) * indicator_weight * category_weight","output":"final_score_fraction","display":"final_score_fraction * 100"}'::jsonb,
 '{"score":"SCORING_RESULT","max_score":"KPI_PARAMETER","indicator_weight":"KPI_PARAMETER","category_weight":"KPI_CATEGORY"}'::jsonb,
 1, '2025-01-01', 'ACTIVE',
 'Formula inti universal, dipakai semua indikator. Sumber: scoring.ts calculateKpiScore formula inti.')

ON CONFLICT (code) DO NOTHING;
