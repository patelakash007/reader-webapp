const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const requiredPaths = [
  'manifest.webmanifest',
  'sw.js',
  'index.html',
  'style.css',
  'script.js',
  'vendor/marked.esm.mjs',
  'vendor/pdf.min.mjs',
  'vendor/pdf.worker.min.mjs',
  'vendor/pdf.min.js',
  'vendor/pdf.worker.min.js',
  'vendor/mammoth.browser.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png'
];

function getLocalModuleImports(relativePath) {
  const source = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
  const imports = [...source.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"](\.{1,2}\/[^'"]+\.mjs)['"]/g)]
    .map(match => path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), match[1])));
  return imports;
}

function getModuleGraph(entryPath) {
  const graph = new Set();
  const pending = [entryPath];
  while (pending.length) {
    const current = pending.pop();
    if (graph.has(current)) continue;
    graph.add(current);
    getLocalModuleImports(current).forEach(importPath => {
      if (!graph.has(importPath)) pending.push(importPath);
    });
  }
  return [...graph].sort();
}

const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const scriptSource = fs.readFileSync(path.join(rootDir, 'script.js'), 'utf8');
if (!indexHtml.includes('script.js')) {
  console.error('index.html does not reference the compatibility script entry.');
  process.exit(1);
}
if (!scriptSource.includes("import('./src/app.mjs')")) {
  console.error('script.js does not reference the ES module application entry.');
  process.exit(1);
}

const moduleGraph = getModuleGraph('src/app.mjs');
requiredPaths.push(...moduleGraph);

const missing = requiredPaths.filter(relativePath => {
  return !fs.existsSync(path.join(rootDir, relativePath));
});

const serviceWorkerSource = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
const missingFromAppShell = moduleGraph.filter(relativePath => !serviceWorkerSource.includes(`'./${relativePath}'`));
if (missingFromAppShell.length > 0) {
  console.error(`Service worker app shell is missing modules: ${missingFromAppShell.join(', ')}`);
  process.exit(1);
}

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

if (!indexHtml.includes('rel="manifest"') && !indexHtml.includes("rel='manifest'")) {
  console.error('index.html does not link to a web manifest.');
  process.exit(1);
}

console.log('PWA validation passed: required app shell files and manifest metadata are valid.');
