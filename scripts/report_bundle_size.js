import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const baselineBytes = 1.65 * 1000 * 1000;
const assetsDir = join(process.cwd(), 'dist', 'assets');

function formatKb(bytes) {
  return `${(bytes / 1000).toFixed(2)} kB`;
}

function readAssets() {
  return readdirSync(assetsDir)
    .filter((fileName) => fileName.endsWith('.js'))
    .map((fileName) => {
      const filePath = join(assetsDir, fileName);
      const source = readFileSync(filePath);
      return {
        fileName,
        size: statSync(filePath).size,
        gzipSize: gzipSync(source).length
      };
    })
    .sort((left, right) => right.size - left.size);
}

function classifyAsset(fileName) {
  if (fileName.startsWith('index-')) {
    return 'initial';
  }

  if (fileName.startsWith('LocationsPage-')) {
    return 'lazy:locations';
  }

  return 'chunk';
}

const assets = readAssets();
const initialAssets = assets.filter((asset) => classifyAsset(asset.fileName) === 'initial');
const initialBytes = initialAssets.reduce((total, asset) => total + asset.size, 0);
const deltaBytes = initialBytes - baselineBytes;
const deltaPrefix = deltaBytes <= 0 ? '-' : '+';

console.log('Bundle size summary');
console.log('===================');
console.log(`Baseline before lazy loading: ${formatKb(baselineBytes)} single-entry JavaScript`);
console.log(
  `Current initial JavaScript: ${formatKb(initialBytes)} (${deltaPrefix}${formatKb(Math.abs(deltaBytes))} vs baseline)`
);
console.log('');
console.log('JavaScript assets:');

for (const asset of assets) {
  console.log(
    `- ${classifyAsset(asset.fileName).padEnd(14)} ${asset.fileName.padEnd(32)} ${formatKb(asset.size).padStart(10)} gzip ${formatKb(asset.gzipSize)}`
  );
}
