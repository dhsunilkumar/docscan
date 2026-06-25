import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const assetsDir = path.join(distDir, 'assets');

try {
  // 1. Find all files in dist/assets
  if (!fs.existsSync(assetsDir)) {
    console.error('Assets directory not found:', assetsDir);
    process.exit(1);
  }

  const assetFiles = fs.readdirSync(assetsDir)
    .map(file => `./assets/${file}`);

  // Base assets to cache
  const allAssets = [
    './',
    './index.html',
    './manifest.json',
    './favicon.svg',
    './icons.svg',
    './opencv.js',
    ...assetFiles
  ];

  // 2. Read dist/sw.js
  const swPath = path.join(distDir, 'sw.js');
  if (!fs.existsSync(swPath)) {
    console.error('Service worker file not found in dist:', swPath);
    process.exit(1);
  }

  let swContent = fs.readFileSync(swPath, 'utf8');

  // 3. Replace the ASSETS_TO_CACHE array in sw.js
  const assetsString = JSON.stringify(allAssets, null, 2);
  swContent = swContent.replace(
    /const ASSETS_TO_CACHE = \[\s*[\s\S]*?\s*\];/g,
    `const ASSETS_TO_CACHE = ${assetsString};`
  );

  // 4. Save back to dist/sw.js
  fs.writeFileSync(swPath, swContent, 'utf8');
  console.log('Successfully updated dist/sw.js with built assets:', assetFiles);
} catch (err) {
  console.error('Post-build script failed:', err);
  process.exit(1);
}
