import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function imageDataUrl(filePath, mimeType = 'image/jpeg') {
  const bytes = globalThis.__fsCache.get(filePath);
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

async function readFileBytes(filePath) {
  const bytes = await fs.readFile(filePath);
  globalThis.__fsCache.set(filePath, bytes);
  return bytes;
}

async function fetchToFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const arrayBuf = await res.arrayBuffer();
  await fs.writeFile(destPath, Buffer.from(arrayBuf));
}

function badgeSvg(team = 'METS') {
  const label = team.toUpperCase();
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
    <defs>
      <radialGradient id="g" cx="32%" cy="25%" r="70%">
        <stop offset="0%" stop-color="#f8fbff"/>
        <stop offset="40%" stop-color="#95c9ff"/>
        <stop offset="72%" stop-color="#2156d9"/>
        <stop offset="100%" stop-color="#102b7a"/>
      </radialGradient>
      <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ff7a18"/>
        <stop offset="50%" stop-color="#ff3d00"/>
        <stop offset="100%" stop-color="#2c63ff"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.5"/>
      </filter>
    </defs>
    <circle cx="120" cy="120" r="110" fill="url(#g)" stroke="url(#ring)" stroke-width="8" filter="url(#shadow)"/>
    <circle cx="120" cy="120" r="95" fill="none" stroke="#ffb36b" stroke-width="3" opacity="0.45"/>
    <path d="M78 70 C95 55, 145 55, 162 70" fill="none" stroke="#f2f2f2" stroke-width="5" opacity="0.7"/>
    <path d="M82 170 C102 182, 138 182, 158 170" fill="none" stroke="#f2f2f2" stroke-width="5" opacity="0.7"/>
    <text x="120" y="99" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="42" font-style="italic" fill="#ff7a18" stroke="#1a46c8" stroke-width="4" paint-order="stroke">${escapeHtml('Fireside')}</text>
    <text x="120" y="158" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="56" letter-spacing="1" fill="#1775ff" stroke="#ff7a18" stroke-width="4" paint-order="stroke">${escapeHtml(label)}</text>
  </svg>`;
}

export async function renderFiresideCarousel(outDir) {
  globalThis.__fsCache = new Map();

  outDir = outDir || path.join(__dirname, '..', 'out', 'fireside-carousel');
  await fs.mkdir(outDir, { recursive: true });
  const imgDir = path.join(outDir, 'images');
  await fs.mkdir(imgDir, { recursive: true });

  const slides = [
    {
      file: '01-carson-benge-slide1.png',
      imageUrl: 'https://cdn.imagn.com/image/thumb/450-425/29122973.jpg',
      title: 'CARSON BENGE JUST MADE THE METS’ RIGHT FIELD JOB A LOT MESSIER.',
      subtitle: 'NEW YORK METS',
      titleSize: 68,
      imagePosition: 'center center',
    },
    {
      file: '02-carson-benge-slide2.png',
      imageUrl: 'https://cdn.imagn.com/image/thumb/450-425/29123605.jpg',
      title: 'Benge went 5-for-5 with a homer, a triple, three runs, and two RBIs in Sunday’s 7-3 win over the Padres.',
      titleSize: 58,
      imagePosition: 'center 35%',
    },
    {
      file: '03-carson-benge-slide3.png',
      imageUrl: 'https://cdn.imagn.com/image/thumb/450-425/29122854.jpg',
      title: 'He entered 2026 as MLB Pipeline’s No. 16 prospect, and the bat is starting to look ready for this level.',
      titleSize: 58,
      imagePosition: 'center 40%',
    },
    {
      file: '04-carson-benge-slide4.png',
      imageUrl: 'https://cdn.imagn.com/image/thumb/450-425/29122823.jpg',
      title: 'That matters because the Mets are still 29-36, and a team this far under water cannot keep waiting on young bats forever.',
      titleSize: 56,
      imagePosition: 'center 38%',
    },
    {
      file: '05-carson-benge-slide5.png',
      imageUrl: 'https://cdn.imagn.com/image/thumb/450-425/29122936.jpg',
      title: 'If Benge keeps doing this, do the Mets have any real argument for taking the bat out of his hands?',
      titleSize: 60,
      imagePosition: 'center 30%',
    },
  ];

  for (const slide of slides) {
    const dest = path.join(imgDir, path.basename(slide.imageUrl));
    await fetchToFile(slide.imageUrl, dest);
    slide.imagePath = dest;
    await readFileBytes(dest);
  }

  const badge = `data:image/svg+xml;base64,${Buffer.from(badgeSvg('METS')).toString('base64')}`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--disable-gpu', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });

  for (const slide of slides) {
    const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          html, body { margin: 0; width: 1080px; height: 1350px; overflow: hidden; background: #fff; }
          body { font-family: Arial, Helvetica, sans-serif; }
          .canvas { position: relative; width: 1080px; height: 1350px; background: #fff; }
          .top {
            position: absolute; left: 0; top: 0; right: 0; height: 330px;
            display: flex; align-items: center; justify-content: center;
            padding: 40px 72px 24px; box-sizing: border-box; text-align: center;
            background: #fff;
          }
          .title {
            color: #111; font-size: ${slide.titleSize}px; line-height: 0.97; font-weight: 900;
            letter-spacing: -1.5px; text-wrap: balance; text-transform: none;
            max-width: 930px; margin: 0 auto;
          }
          .subtitle {
            position: absolute; top: 18px; left: 0; right: 0; text-align: center;
            color: #7a7a7a; font-size: 20px; letter-spacing: 2px; font-weight: 800;
          }
          .image-wrap {
            position: absolute; left: 0; right: 0; top: 330px; bottom: 0;
            overflow: hidden; background: #111;
          }
          .image-wrap::after {
            content: ''; position: absolute; inset: 0;
            background: linear-gradient(to bottom, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.08) 70%, rgba(0,0,0,0.18) 100%);
            pointer-events: none;
          }
          .photo {
            position: absolute; inset: 0;
            background-image: url('${imageDataUrl(slide.imagePath, 'image/jpeg')}');
            background-size: cover;
            background-position: ${slide.imagePosition};
            filter: saturate(1.08) contrast(1.03);
            transform: scale(1.01);
          }
          .badge {
            position: absolute; right: 36px; bottom: 34px;
            width: 138px; height: 138px;
            filter: drop-shadow(0 10px 14px rgba(0,0,0,.45));
            z-index: 2;
          }
        </style>
      </head>
      <body>
        <div class="canvas">
          <div class="top">
            ${slide.subtitle ? `<div class="subtitle">${escapeHtml(slide.subtitle)}</div>` : ''}
            <div class="title">${escapeHtml(slide.title)}</div>
          </div>
          <div class="image-wrap">
            <div class="photo"></div>
            <img class="badge" src="${badge}" alt="Fireside Mets" />
          </div>
        </div>
      </body>
    </html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: path.join(outDir, slide.file) });
  }

  const caption = `Carson Benge just gave the Mets a problem they should probably welcome. His five-hit game in San Diego was the kind of performance that turns a young player from a nice story into an actual roster decision. The Mets are still 29-36, so now it is on them: keep forcing the veterans or let the kid keep playing.`;
  await fs.writeFile(path.join(outDir, 'caption.txt'), caption + '\n');
  await browser.close();
  console.log(outDir);
}
