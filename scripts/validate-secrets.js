/**
 * Pre-Flight Secret & Environment Validator
 * Memastikan konfigurasi production valid sebelum aplikasi diperbolehkan booting.
 */

const requiredRules = [
  { key: 'POSTGRES_PASSWORD', minLength: 4, forbid: ['generate_strong_password_here'] },
  { key: 'POSTGRES_USER', minLength: 3, forbid: [] },
  { key: 'POSTGRES_DB', minLength: 3, forbid: [] },
  { key: 'DATABASE_URL', minLength: 15, forbid: [] },
  { key: 'JWT_SECRET', minLength: 32, forbid: ['your_jwt_secret_key_minimum_32_characters_random_here'] },
];

let hasErrors = false;
console.log('🔐 [SECURITY AUDIT] Memvalidasi Variabel Lingkungan & Kredensial Produksi...');

for (const rule of requiredRules) {
  const value = process.env[rule.key];

  if (!value || value.trim() === '') {
    console.error(`❌ [SECRET MISSING] Variabel ${rule.key} wajib disetel.`);
    hasErrors = true;
    continue;
  }

  const cleanVal = value.trim();

  if (rule.minLength && cleanVal.length < rule.minLength) {
    console.error(`❌ [SECURITY RISK] ${rule.key} terlalu pendek! Minimal ${rule.minLength} karakter (terdeteksi: ${cleanVal.length}).`);
    hasErrors = true;
  }

  if (rule.forbid && rule.forbid.includes(cleanVal)) {
    console.error(`❌ [INSECURE VALUE] ${rule.key} masih menggunakan nilai template placeholder default! Ganti dengan kredensial riil.`);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error('\n🚨 VALIDASI KREDENSIAL GAGAL: Aplikasi menolak start demi melindungi keamanan sistem.');
  process.exit(1);
} else {
  console.log('✓ [SECURITY AUDIT] Seluruh variabel rahasia memenuhi standar keamanan produksi.');
}
