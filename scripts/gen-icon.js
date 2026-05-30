'use strict';

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const BAUHAUS_TTF = 'C:\\Windows\\Fonts\\BAUHS93.TTF';
const BLUE = '#0A66C2';
const SIZE = 1024;

// Embed the TTF as base64 so librsvg resolves the font without system fontconfig
const fontB64 = fs.readFileSync(BAUHAUS_TTF).toString('base64');
const fontFace = `@font-face {
  font-family: 'Bauhaus93';
  src: url('data:font/truetype;base64,${fontB64}') format('truetype');
  font-weight: 900;
}`;

function iconSvg(fontSize) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
<defs><style>${fontFace}</style></defs>
<rect width="${SIZE}" height="${SIZE}" fill="${BLUE}"/>
<text
  x="${SIZE / 2}"
  y="${SIZE / 2}"
  font-family="Bauhaus93, Arial Black, Arial"
  font-size="${fontSize}"
  fill="#FFFFFF"
  text-anchor="middle"
  dominant-baseline="central">Orbi</text>
</svg>`;
}

function adaptiveSvg(fontSize) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
<defs><style>${fontFace}</style></defs>
<text
  x="${SIZE / 2}"
  y="${SIZE / 2}"
  font-family="Bauhaus93, Arial Black, Arial"
  font-size="${fontSize}"
  fill="#FFFFFF"
  text-anchor="middle"
  dominant-baseline="central">Orbi</text>
</svg>`;
}

async function run() {
  const apps = ['rider-app', 'driver-app'];

  for (const app of apps) {
    const dir = path.join(__dirname, '..', 'apps', app);

    await sharp(Buffer.from(iconSvg(360)))
      .png()
      .toFile(path.join(dir, 'icon.png'));
    console.log(`  icon.png          -> apps/${app}/icon.png`);

    await sharp(Buffer.from(adaptiveSvg(290)))
      .png()
      .toFile(path.join(dir, 'adaptive-icon.png'));
    console.log(`  adaptive-icon.png -> apps/${app}/adaptive-icon.png`);
  }

  console.log('\nDone. Bauhaus 93 embedded via base64 in both icons.');
}

run().catch((err) => { console.error(err); process.exit(1); });
