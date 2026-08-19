const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const requiredPaths = [
  'manifest.webmanifest',
  'sw.js',
  'index.html',
  'style.css',
  'script.js',
  'session-desk.js',
  'session-desk-activation.js',
  'vendor/pdf.min.js',
  'vendor/pdf.worker.min.js',
  'vendor/mammoth.browser.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png'
];

const missing = requiredPaths.filter(relativePath => !fs.existsSync(path.join(rootDir, relativePath)));
if (missing.length > 0) {
  console.error(`Missing required PWA files: ${missing.join(', ')}`);
  process.exit(1);
}

const manifestPath = path.join(rootDir, 'manifest.webmanifest');
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`manifest.webmanifest is not valid JSON: ${error.message}`);
  process.exit(1);
}

const requiredManifestFields = ['name', 'short_name', 'start_url', 'display', 'icons'];
const missingFields = requiredManifestFields.filter(field => !manifest[field]);
if (missingFields.length > 0) {
  console.error(`manifest.webmanifest is missing required fields: ${missingFields.join(', ')}`);
  process.exit(1);
}

if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) {
  console.error('manifest.webmanifest must define at least two icons.');
  process.exit(1);
}

const missingIcons = manifest.icons
  .map(icon => icon && icon.src)
  .filter(Boolean)
  .filter(src => !fs.existsSync(path.join(rootDir, src)));
if (missingIcons.length > 0) {
  console.error(`manifest.webmanifest references missing icons: ${missingIcons.join(', ')}`);
  process.exit(1);
}

const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
if (!indexHtml.includes('rel="manifest"') && !indexHtml.includes("rel='manifest'")) {
  console.error('index.html does not link to a web manifest.');
  process.exit(1);
}

const serviceWorker = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
for (const asset of ["'./session-desk.js'", "'./session-desk-activation.js'"]) {
  if (!serviceWorker.includes(asset)) {
    console.error(`sw.js does not cache ${asset}.`);
    process.exit(1);
  }
}

console.log('PWA validation passed: app shell, manifest metadata, reading-desk controllers, and service-worker boundary are consistent.');
