import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rebuild } from '@electron/rebuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.resolve(projectRoot, 'dist');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function getElectronVersion() {
  const electronPkg = path.resolve(projectRoot, 'node_modules', 'electron', 'package.json');
  if (!fs.existsSync(electronPkg)) return null;
  return readJson(electronPkg).version ?? null;
}

async function main() {
  const electronVersion = getElectronVersion();
  if (!electronVersion) {
    console.warn('[rebuild-level] electron not found, skip');
    return;
  }

  // If prebuilt binaries work, rebuild is unnecessary; keep build resilient.
  try {
    await rebuild({
      buildPath: distRoot,
      electronVersion,
      onlyModules: ['leveldown'],
      force: true,
    });
    console.log('[rebuild-level] done');
  } catch (err) {
    console.warn('[rebuild-level] failed, continue (prebuild may still work)');
    console.warn(err?.message ?? err);
  }
}

await main();

