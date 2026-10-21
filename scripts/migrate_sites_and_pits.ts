import { sql } from "drizzle-orm";
import { db } from "../src/db";

async function runMigration() {
  console.log("--- Starting Master Site & PIT Schema Migration ---");

  // 1. Create table `sites` if not exists
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sites (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  console.log("✓ Table 'sites' verified or created.");

  // Create indexes on sites
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_sites_code ON sites(code);
    CREATE INDEX IF NOT EXISTS idx_sites_is_active ON sites(is_active);
  `);
  console.log("✓ Indexes on 'sites' created.");

  // 2. Transfer existing real operating units from system_config into `sites` (without creating any fake dummy data)
  const existingSites = await db.execute(sql`SELECT count(*)::int as count FROM sites;`);
  const siteCount = Number(existingSites.rows[0]?.count || 0);

  if (siteCount === 0) {
    const sysCfg = await db.execute(sql`SELECT value FROM system_config WHERE key = 'master_operating_units';`);
    const cfgVal = sysCfg.rows[0]?.value;
    let unitsToInsert: { code: string; name: string; description: string }[] = [];

    if (cfgVal) {
      try {
        const parsed = JSON.parse(String(cfgVal));
        if (Array.isArray(parsed)) {
          unitsToInsert = parsed.map((u: any) => ({
            code: String(u.name || "").trim().toUpperCase(),
            name: String(u.name || "").trim().toUpperCase() === "HO" ? "Head Office" : `Site ${String(u.name || "").trim().toUpperCase()}`,
            description: `Unit Operasional ${String(u.name || "").trim().toUpperCase()}`,
          })).filter((u) => u.code.length > 0);
        }
      } catch (e) {
        console.error("Error parsing saved operating units:", e);
      }
    }

    // Fallback only if no units in config: check distinct operating_unit in employees
    if (unitsToInsert.length === 0) {
      const empOUs = await db.execute(sql`SELECT DISTINCT operating_unit FROM employees WHERE operating_unit IS NOT NULL;`);
      unitsToInsert = empOUs.rows.map((r: any) => ({
        code: String(r.operating_unit).trim().toUpperCase(),
        name: String(r.operating_unit).trim().toUpperCase(),
        description: `Unit Operasional ${String(r.operating_unit).trim().toUpperCase()}`,
      }));
    }

    for (const u of unitsToInsert) {
      await db.execute(sql`
        INSERT INTO sites (code, name, description, is_active, created_at, updated_at)
        VALUES (${u.code}, ${u.name}, ${u.description}, true, NOW(), NOW())
        ON CONFLICT (code) DO NOTHING;
      `);
      console.log(`✓ Preserved existing site: ${u.code} (${u.name})`);
    }
  } else {
    console.log(`✓ Sites table already contains ${siteCount} records.`);
  }

  // 3. Ensure `site_id` column exists in `pits` table
  await db.execute(sql`
    ALTER TABLE pits ADD COLUMN IF NOT EXISTS site_id INTEGER REFERENCES sites(id) ON DELETE RESTRICT;
  `);
  console.log("✓ Column 'site_id' verified on 'pits'.");

  // Link existing pits to their matching site_id
  await db.execute(sql`
    UPDATE pits p
    SET site_id = s.id
    FROM sites s
    WHERE UPPER(TRIM(p.site)) = UPPER(TRIM(s.code))
      AND (p.site_id IS NULL OR p.site_id <> s.id);
  `);
  console.log("✓ Linked existing pits to their matching site_id in 'sites' table.");

  // 4. Ensure `site_id` column exists in `department_mappings` and `kpi_templates`
  await db.execute(sql`
    ALTER TABLE department_mappings ADD COLUMN IF NOT EXISTS site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL;
  `);
  await db.execute(sql`
    ALTER TABLE kpi_templates ADD COLUMN IF NOT EXISTS site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL;
  `);

  await db.execute(sql`
    UPDATE department_mappings dm
    SET site_id = s.id
    FROM sites s
    WHERE dm.site IS NOT NULL AND dm.site <> 'ALL' AND UPPER(TRIM(dm.site)) = UPPER(TRIM(s.code))
      AND dm.site_id IS NULL;
  `);

  await db.execute(sql`
    UPDATE kpi_templates kt
    SET site_id = s.id
    FROM sites s
    WHERE kt.site IS NOT NULL AND kt.site <> 'ALL' AND UPPER(TRIM(kt.site)) = UPPER(TRIM(s.code))
      AND kt.site_id IS NULL;
  `);
  console.log("✓ Linked site_id on department_mappings and kpi_templates.");

  console.log("--- Migration Completed Successfully ---");
}

runMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
