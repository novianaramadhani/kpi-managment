import pg from "pg";

async function runMigration() {
  console.log("--- Starting Migration: Add pit_id to employees table ---");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set in environment");
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    // 1. Add pit_id column to employees table if not exists
    await client.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS pit_id INTEGER REFERENCES pits(id) ON DELETE SET NULL;
    `);
    console.log("✓ Column employees.pit_id verified or added successfully.");

    // 2. Create index on pit_id for fast lookup
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employees_pit_id ON employees(pit_id);
    `);
    console.log("✓ Index idx_employees_pit_id verified or created successfully.");

    // 3. Inspect existing employees and count
    const result = await client.query(`
      SELECT count(*)::int as total,
             count(pit_id)::int as with_pit
      FROM employees;
    `);
    console.log("✓ Current employee stats:", result.rows[0]);

    console.log("--- Migration Completed Successfully ---");
    process.exit(0);
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
