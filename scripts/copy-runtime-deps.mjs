import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.resolve(projectRoot, 'dist');
const distNodeModules = path.resolve(distRoot, 'node_modules');

const rootPackages = ['level'];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.cpSync(src, dest, { recursive: true, dereference: true });
}

function distModuleDirFromName(name) {
  return path.resolve(distNodeModules, ...name.split('/'));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function getDepsFromPkg(pkg) {
  const deps = new Set();
  for (const key of ['dependencies', 'optionalDependencies']) {
    const obj = pkg?.[key];
    if (!obj) continue;
    for (const depName of Object.keys(obj)) deps.add(depName);
  }
  return [...deps];
}

function main() {
  const require = createRequire(import.meta.url);
  ensureDir(distNodeModules);

  // Ensure dist has plugin metadata for tooling that expects it.
  const pkgPath = path.resolve(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    copyDir(pkgPath, path.resolve(distRoot, 'package.json'));
  }

  const visited = new Set();
  const queue = rootPackages.map(name => ({ name, fromDir: projectRoot }));

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item?.name) continue;

    let pkgJsonPath = '';
    try {
      pkgJsonPath = require.resolve(`${item.name}/package.json`, { paths: [item.fromDir] });
    } catch {
      console.warn(`[copy-runtime-deps] skip unresolved: ${item.name}`);
      continue;
    }

    const srcDir = path.dirname(pkgJsonPath);
    const pkg = readJson(pkgJsonPath);
    const pkgName = pkg?.name ?? item.name;

    if (visited.has(pkgName)) continue;
    visited.add(pkgName);

    const destDir = distModuleDirFromName(pkgName);
    copyDir(srcDir, destDir);
    console.log(`[copy-runtime-deps] copied: ${pkgName}`);

    for (const depName of getDepsFromPkg(pkg)) {
      if (!visited.has(depName)) queue.push({ name: depName, fromDir: srcDir });
    }
  }
}

main();

