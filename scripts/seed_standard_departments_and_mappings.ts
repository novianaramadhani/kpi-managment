import { pool } from "../src/db";

async function main() {
  const client = await pool.connect();
  try {
    console.log("Seeding standard departments & mappings...");

    // 1. Ensure Standard Departments exist
    const standardDepts = [
      { code: "PROD", name: "Produksi" },
      { code: "HRGA", name: "HRGA" },
      { code: "LOGISTIC", name: "LOGISTIC" },
      { code: "TC", name: "Training Center" },
      { code: "PLANT", name: "Plant" },
      { code: "HSE", name: "HSE" },
    ];

    for (const d of standardDepts) {
      await client.query(`
        INSERT INTO departments (code, name)
        VALUES ($1, $2)
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;
      `, [d.code, d.name]);
    }
    console.log("✓ Standard departments verified");

    // Fetch department ids
    const deptsRes = await client.query("SELECT id, code, name FROM departments");
    const deptMap = new Map(deptsRes.rows.map((r: { id: number; code: string; name: string }) => [r.code, r.id]));

    // 2. Insert Sample Mappings
    const sampleMappings = [
      {
        site: "GAM",
        raw: "HRGA-JO",
        clean: "HRGA-JO",
        deptId: deptMap.get("HRGA"),
        detail: null,
        status: "MAPPED",
        notes: "Pemetaan departemen HRGA untuk Site GAM",
      },
      {
        site: "GAM",
        raw: "Produksi BCM Selatan",
        clean: "PRODUKSI BCM SELATAN",
        deptId: deptMap.get("PROD"),
        detail: "BCM Selatan",
        status: "MAPPED",
        notes: "Unit BCM Selatan dipetakan ke Produksi",
      },
      {
        site: "GAM",
        raw: "Produksi BCM Utara",
        clean: "PRODUKSI BCM UTARA",
        deptId: deptMap.get("PROD"),
        detail: "BCM Utara",
        status: "MAPPED",
        notes: "Unit BCM Utara dipetakan ke Produksi",
      },
      {
        site: "GAM",
        raw: "Produksi Mining Service",
        clean: "PRODUKSI MINING SERVICE",
        deptId: deptMap.get("PROD"),
        detail: "Mining Service",
        status: "MAPPED",
        notes: "Unit Mining Service dipetakan ke Produksi",
      },
      {
        site: "AKP",
        raw: "Logistik",
        clean: "LOGISTIK",
        deptId: deptMap.get("LOGISTIC"),
        detail: null,
        status: "MAPPED",
        notes: "Site AKP logistik ke LOGISTIC standar",
      },
      {
        site: "ALL",
        raw: "TC",
        clean: "TC",
        deptId: deptMap.get("TC"),
        detail: null,
        status: "MAPPED",
        notes: "Singkatan TC ke Training Center",
      },
      {
        site: "AKP",
        raw: "TC Lapangan",
        clean: "TC LAPANGAN",
        deptId: deptMap.get("TC"),
        detail: "Lapangan",
        status: "MAPPED",
        notes: "TC Lapangan AKP ke Training Center",
      },
      {
        site: "GAM",
        raw: "Civil & General",
        clean: "CIVIL & GENERAL",
        deptId: null,
        detail: null,
        status: "UNMAPPED",
        notes: "Contoh belum dipetakan untuk testing",
      },
    ];

    for (const m of sampleMappings) {
      await client.query(`
        INSERT INTO department_mappings (site, raw_department_name, clean_raw_name, department_id, original_unit_detail, status, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (site, clean_raw_name) DO UPDATE SET
          department_id = EXCLUDED.department_id,
          original_unit_detail = EXCLUDED.original_unit_detail,
          status = EXCLUDED.status,
          notes = EXCLUDED.notes;
      `, [m.site, m.raw, m.clean, m.deptId, m.detail, m.status, m.notes]);
    }

    console.log("✓ Sample department mappings successfully seeded");
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

main();
