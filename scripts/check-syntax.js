const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const productionModules = fs.readdirSync(path.join(rootDir, 'src'))
  .filter(fileName => fileName.endsWith('.mjs'))
  .sort()
  .map(fileName => path.join(rootDir, 'src', fileName));
const files = [path.join(rootDir, 'script.js'), ...productionModules];

for (const filePath of files) {
  const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `Syntax check failed for ${filePath}.\n`);
    process.exit(result.status || 1);
  }
}

console.log(`JavaScript syntax validation passed for ${files.length} browser files.`);
