import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const appIconSource = path.join(root, 'design', 'logo', 'orbi-app-icon.svg');
const iconSource = path.join(root, 'design', 'logo', 'orbi-icon.svg');
const logoSource = path.join(root, 'design', 'logo', 'orbi-logo.svg');
const apps = [
  path.join(root, 'apps', 'rider-app'),
  path.join(root, 'apps', 'driver-app'),
];

async function renderAppAssets(appRoot) {
  await sharp(appIconSource).resize(1024, 1024).png().toFile(path.join(appRoot, 'icon.png'));
  await sharp(appIconSource)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(appRoot, 'adaptive-icon.png'));
  await sharp(iconSource).resize(32, 32).png().toFile(path.join(appRoot, 'favicon.png'));

  const logo = await sharp(logoSource).resize({ width: 620 }).png().toBuffer();
  const splashSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1284" height="2778" viewBox="0 0 1284 2778">
  <rect width="1284" height="2778" fill="#07111d"/>
</svg>`;

  await sharp(Buffer.from(splashSvg))
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(appRoot, 'splash.png'));
}

await fs.access(appIconSource);
await fs.access(iconSource);
await fs.access(logoSource);

for (const appRoot of apps) {
  await renderAppAssets(appRoot);
  console.log(`Generated Expo brand assets in ${path.relative(root, appRoot)}`);
}
