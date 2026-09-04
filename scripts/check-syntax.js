const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');

function getFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(ext))
    .sort()
    .map(f => path.join(dir, f));
}

const srcFiles = getFiles(path.join(rootDir, 'src'), '.mjs');
const scriptFiles = getFiles(path.join(rootDir, 'scripts'), '.js');
const testFiles = getFiles(path.join(rootDir, 'tests'), '.js');
const rootFiles = ['script.js', 'sw.js']
  .map(f => path.join(rootDir, f))
  .filter(f => fs.existsSync(f));

const allFiles = [...rootFiles, ...srcFiles, ...scriptFiles, ...testFiles];

// 1. JavaScript syntax validation on all files
for (const filePath of allFiles) {
  const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `Syntax check failed for ${filePath}.\n`);
    process.exit(result.status || 1);
  }
}

// 2. ESM import integrity verification
(async () => {
  for (const filePath of srcFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importedNames = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const relativeModule = match[2];
      const targetPath = path.resolve(path.dirname(filePath), relativeModule);
      if (!fs.existsSync(targetPath)) {
        console.error(`Import target does not exist: ${relativeModule} in ${filePath}`);
        process.exit(1);
      }
      try {
        const mod = await import(targetPath);
        for (const name of importedNames) {
          if (!(name in mod)) {
            console.error(`Missing export '${name}' from ${relativeModule} imported by ${filePath}`);
            process.exit(1);
          }
        }
      } catch (err) {
        console.error(`Failed to load module ${targetPath}:`, err);
        process.exit(1);
      }
    }
  }

  // 3. ESLint execution if available
  const eslintBin = path.join(rootDir, 'node_modules', '.bin', 'eslint');
  if (fs.existsSync(eslintBin)) {
    const eslintResult = spawnSync(eslintBin, ['src/', 'scripts/', 'tests/'], { encoding: 'utf8', stdio: 'inherit' });
    if (eslintResult.status !== 0) {
      process.exit(eslintResult.status || 1);
    }
  }

  console.log(`JavaScript syntax and import validation passed for ${allFiles.length} files.`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
