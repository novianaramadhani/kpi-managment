/**
 * Production Database Migration Runner with PostgreSQL Session-Level Advisory Lock & Baseline Safety
 * Pure Node.js (CommonJS) - zero external TypeScript compilation needed at runtime.
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const ADVISORY_LOCK_ID = 748291823; // 64-bit safe unique lock identifier for KPI app
const MIGRATIONS_DIR = path.join(__dirname, '../drizzle');

async function runProductionMigration() {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    console.error('❌ [MIGRATION ERROR] Variabel lingkungan DATABASE_URL belum disetel.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10000,
  });

  // Dedicated client connection to ensure session-level advisory lock integrity
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    console.log('🔒 [MIGRATION] Meminta PostgreSQL Advisory Lock (ID: ' + ADVISORY_LOCK_ID + ')...');
    const tryLockRes = await client.query(
      'SELECT pg_try_advisory_lock($1) AS locked;',
      [ADVISORY_LOCK_ID]
    );

    if (tryLockRes.rows[0].locked) {
      lockAcquired = true;
      console.log('✓ [MIGRATION] Advisory Lock berhasil diperoleh secara eksklusif.');
    } else {
      console.log('⏳ [MIGRATION] Container lain sedang mengeksekusi migrasi. Menunggu giliran lock...');
      await client.query('SELECT pg_advisory_lock($1);', [ADVISORY_LOCK_ID]);
      lockAcquired = true;
      console.log('✓ [MIGRATION] Advisory Lock berhasil diperoleh setelah antrean.');
    }

    // 1. Buat tabel pencatat migrasi jika belum ada
    await client.query(`
      CREATE TABLE IF NOT EXISTS __app_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Ambil daftar migrasi yang sudah pernah sukses
    const executedRes = await client.query('SELECT migration_name FROM __app_migrations;');
    const executedSet = new Set(executedRes.rows.map((r) => r.migration_name));

    // 3. Baseline Detection: Jika __app_migrations kosong tapi tabel inti sudah ada di database
    if (executedSet.size === 0) {
      const checkTableRes = await client.query(`
        SELECT count(*) AS count 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name IN ('employees', 'appraisals', 'departments');
      `);
      const existingCoreTables = parseInt(checkTableRes.rows[0].count, 10);

      if (existingCoreTables > 0) {
        console.log('ℹ️ [MIGRATION BASELINE] Terdeteksi ' + existingCoreTables + ' tabel inti yang sudah ada.');
        console.log('ℹ️ [MIGRATION BASELINE] Menandai 0000_init.sql sebagai baseline agar tidak merusak data lama.');
        await client.query(
          "INSERT INTO __app_migrations (migration_name) VALUES ('0000_init.sql') ON CONFLICT DO NOTHING;"
        );
        executedSet.add('0000_init.sql');
      }
    }

    // 4. Baca seluruh file SQL di direktori drizzle/ secara alfabetis
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.log('ℹ️ [MIGRATION] Direktori drizzle/ tidak ditemukan. Melewati migrasi SQL.');
      return;
    }

    const migrationFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      if (executedSet.has(file)) {
        console.log(`⏩ [MIGRATION] Melewati ${file} (sudah diterapkan).`);
        continue;
      }

      console.log(`▶️ [MIGRATION] Menerapkan migrasi: ${file}...`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');

      // Jalankan tiap migrasi dalam blok transaksi atomik
      try {
        await client.query('BEGIN;');
        // Jalankan perintah SQL (split statement breakpoint jika ada)
        const statements = sqlContent.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
        for (const stmt of statements) {
          if (stmt) {
            await client.query(stmt);
          }
        }
        await client.query(
          'INSERT INTO __app_migrations (migration_name) VALUES ($1);',
          [file]
        );
        await client.query('COMMIT;');
        console.log(`✓ [MIGRATION] Sukses menerapkan: ${file}`);
      } catch (sqlErr) {
        await client.query('ROLLBACK;');
        console.error(`❌ [MIGRATION FAILED] Gagal saat mengeksekusi file ${file}:`, sqlErr.message);
        throw sqlErr;
      }
    }

    console.log('🎉 [MIGRATION] Seluruh skema database telah sinkron dan up-to-date.');
  } catch (error) {
    console.error('❌ [MIGRATION FATAL] Terjadi kesalahan fatal selama migrasi database:', error);
    process.exit(1);
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1);', [ADVISORY_LOCK_ID]);
        console.log('🔓 [MIGRATION] Advisory Lock berhasil dilepaskan.');
      } catch (unlockErr) {
        console.error('⚠️ [MIGRATION] Peringatan: gagal melepas advisory lock secara manual:', unlockErr.message);
      }
    }
    client.release();
    await pool.end();
  }
}

runProductionMigration();
