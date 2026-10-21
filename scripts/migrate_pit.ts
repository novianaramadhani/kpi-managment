import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { pool } from "../src/db";

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log("Starting migration for Master PIT...");

    // 1. Create table pits if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS pits (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        site TEXT NOT NULL DEFAULT 'GAM',
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log("✓ Table pits verified/created");

    // 2. Create indexes on pits
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pits_site ON pits (site);
      CREATE INDEX IF NOT EXISTS idx_pits_is_active ON pits (is_active);
    `);
    console.log("✓ Indexes on pits created");

    // 3. Add pit_id to department_mappings
    await client.query(`
      ALTER TABLE department_mappings
      ADD COLUMN IF NOT EXISTS pit_id INTEGER REFERENCES pits(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_dept_map_pit_id ON department_mappings (pit_id);
    `);
    console.log("✓ Column department_mappings.pit_id verified/created");

    // 4. Add site, pit_id, department_mapping_id to kpi_templates
    await client.query(`
      ALTER TABLE kpi_templates
      ADD COLUMN IF NOT EXISTS site TEXT,
      ADD COLUMN IF NOT EXISTS pit_id INTEGER REFERENCES pits(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS department_mapping_id INTEGER REFERENCES department_mappings(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_kpi_tpl_pit_id ON kpi_templates (pit_id);
      CREATE INDEX IF NOT EXISTS idx_kpi_tpl_site ON kpi_templates (site);
    `);
    console.log("✓ Columns kpi_templates (site, pit_id, department_mapping_id) verified/created");

    // 5. Seed initial standard PIT data
    const initialPits = [
      { code: "BCM-S", name: "BCM Selatan", site: "GAM", desc: "Pit Penambangan BCM Sektor Selatan (Site GAM)" },
      { code: "BCM-U", name: "BCM Utara", site: "GAM", desc: "Pit Penambangan BCM Sektor Utara (Site GAM)" },
      { code: "BCM-B", name: "BCM Barat", site: "GAM", desc: "Pit Penambangan BCM Sektor Barat (Site GAM)" },
      { code: "MINING-SVC", name: "Mining Service", site: "GAM", desc: "Unit & Sektor Mining Service (Site GAM)" },
      { code: "PIT-AKP-1", name: "Pit AKP 1", site: "AKP", desc: "Pit Penambangan Sektor 1 (Site AKP)" },
      { code: "PIT-AKP-2", name: "Pit AKP 2", site: "AKP", desc: "Pit Penambangan Sektor 2 (Site AKP)" },
    ];

    for (const p of initialPits) {
      await client.query(
        `
        INSERT INTO pits (code, name, site, description, is_active)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name, site = EXCLUDED.site, description = EXCLUDED.description;
      `,
        [p.code, p.name, p.site, p.desc]
      );
    }
    console.log("✓ Initial standard PITs seeded");

    // 6. Link existing department_mappings to PITs if matches found
    await client.query(`
      UPDATE department_mappings dm
      SET pit_id = p.id
      FROM pits p
      WHERE dm.pit_id IS NULL AND (
        (p.code = 'BCM-S' AND (dm.raw_department_name ILIKE '%BCM Selatan%' OR dm.original_unit_detail ILIKE '%BCM Selatan%')) OR
        (p.code = 'BCM-U' AND (dm.raw_department_name ILIKE '%BCM Utara%' OR dm.original_unit_detail ILIKE '%BCM Utara%')) OR
        (p.code = 'MINING-SVC' AND (dm.raw_department_name ILIKE '%Mining Service%' OR dm.original_unit_detail ILIKE '%Mining Service%'))
      );
    `);
    console.log("✓ Existing department_mappings linked to PITs");

    console.log("Migration for Master PIT completed successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
