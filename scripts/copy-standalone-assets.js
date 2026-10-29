const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const srcStatic = path.join(rootDir, '.next_fresh', 'static');
const destStatic = path.join(rootDir, '.next_fresh', 'standalone', '.next_fresh', 'static');
const srcPublic = path.join(rootDir, 'public');
const destPublic = path.join(rootDir, '.next_fresh', 'standalone', 'public');

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursiveSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  console.log('Copying static assets to standalone directory...');
  copyRecursiveSync(srcStatic, destStatic);
  console.log('Copying public assets to standalone directory...');
  copyRecursiveSync(srcPublic, destPublic);
  console.log('✓ Standalone static assets copied successfully!');
} catch (err) {
  console.error('Failed to copy standalone assets:', err);
  process.exit(1);
}
