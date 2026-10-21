import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { pool } from "../src/db";

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log("Starting migration for department mapping...");

    // 1. Create enum mapping_status if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mapping_status') THEN
          CREATE TYPE mapping_status AS ENUM ('MAPPED', 'UNMAPPED', 'PENDING_VALIDATION');
        END IF;
      END$$;
    `);
    console.log("✓ Enum mapping_status verified/created");

    // 2. Create table department_mappings if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS department_mappings (
        id SERIAL PRIMARY KEY,
        site TEXT NOT NULL DEFAULT 'ALL',
        raw_department_name TEXT NOT NULL,
        clean_raw_name TEXT NOT NULL,
        department_id INTEGER REFERENCES departments(id) ON DELETE RESTRICT,
        original_unit_detail TEXT,
        status mapping_status NOT NULL DEFAULT 'MAPPED',
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log("✓ Table department_mappings verified/created");

    // 3. Create indexes
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dept_map_site_clean_name
      ON department_mappings (site, clean_raw_name);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dept_map_dept_id
      ON department_mappings (department_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dept_map_status
      ON department_mappings (status);
    `);
    console.log("✓ Indexes on department_mappings created");

    // 4. Add original_department to employees if not exists
    await client.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS original_department TEXT;
    `);
    console.log("✓ Column employees.original_department verified/created");

    console.log("Migration completed successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
