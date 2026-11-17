/* =========================================================
   RENDER GAMBAR — headless Chrome (puppeteer-core).
   Markup & CSS menyalin preview situs (buildNode + assets/templates.css),
   dirender di Chrome asli sehingga line-clamp,
   backdrop-filter, box-shadow, dan emoji ikut ter-render —
   bug "preview ≠ render" (html2canvas) hilang secara struktural.

   Chrome diambil dari environment CHROME_PATH atau lokasi
   umum (runner GitHub Actions punya google-chrome-stable).
   Hasil render di-upload ke Cloudinary (env worker).
========================================================= */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import { v2 as cloudinary } from 'cloudinary';
import type { RenderState } from './templates/render';

const BUNDLE_URL = new URL('./render-bundle.js', import.meta.url);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/sbin/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
].filter((p): p is string => Boolean(p));

function findChrome(): string {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    'Chrome/Chromium tidak ditemukan — set env CHROME_PATH atau install google-chrome-stable. ' +
    'Dicari di: ' + CHROME_CANDIDATES.join(', '),
  );
}

/* HTML shell: font sama dengan Base.astro (Quicksand + Baloo 2). Markup &
   CSS template diinjeksi oleh bundle (render-entry.ts). */
const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">';

const SHELL = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">${FONT_LINK}` +
  `<style>html,body{margin:0;padding:0;background:#fff}</style></head><body></body></html>`;

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await puppeteer.launch({
      executablePath: findChrome(),
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--force-color-profile=srgb',
        '--hide-scrollbars',
        '--font-render-hinting=none',
      ],
    });
  }
  return browser;
}

/** Tutup browser render — dipanggil di akhir run worker. */
export async function shutdownRenderer(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}

function cloudinaryReady(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET,
  );
}

/** Upload buffer JPEG ke Cloudinary → URL eager JPEG. Dipakai `renderFessImage`
 *  dan `src/render-queue.ts` (render lokal untuk posting manual). */
export function uploadImage(buffer: Buffer, publicId: string): Promise<string> {
  if (!cloudinaryReady()) {
    return Promise.reject(new Error('Cloudinary belum dikonfigurasi (CLOUDINARY_* di env worker)'));
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'umpomenfess', public_id: publicId, resource_type: 'image', format: 'jpg',
        eager: [{ format: 'jpg', quality: 90 }], eager_async: false,
      },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error('upload kosong'));
        const eagerUrl = result.eager?.[0]?.secure_url;
        if (!eagerUrl) return reject(new Error('Cloudinary tidak mengembalikan URL eager JPEG'));
        resolve(eagerUrl);
      },
    );
    stream.end(buffer);
  });
}

/** Render satu fess → JPEG 1080×1350 (buffer). Markup & CSS persis preview. */
export async function renderToBuffer(state: RenderState): Promise<Buffer> {
  if (!existsSync(fileURLToPath(BUNDLE_URL))) {
    throw new Error('render-bundle.js belum ada — jalankan `npm run render:bundle` dulu');
  }
  const bundleCode = readFileSync(fileURLToPath(BUNDLE_URL), 'utf8');

  const b = await getBrowser();
  const page: Page = await b.newPage();
  try {
    await page.setViewport({ width: 540, height: 675, deviceScaleFactor: 2 });
    await page.setContent(SHELL, { waitUntil: 'load', timeout: 60_000 });
    await page.addScriptTag({ content: bundleCode });
    const hasRender = await page.evaluate(() => typeof window.__renderFess === 'function');
    if (!hasRender) {
      throw new Error('bundle render tidak mendaftarkan window.__renderFess');
    }
    await page.evaluate((s) => window.__renderFess!(s as RenderState), state as unknown);
    // tunggu font Google + emoji selesai dimuat, lalu dua frame agar layout settle
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    const el = await page.$('.mfsp');
    if (!el) throw new Error('node .mfsp tidak ditemukan setelah render');
    return (await el.screenshot({ type: 'jpeg', quality: 92, encoding: 'binary' })) as Buffer;
  } finally {
    await page.close().catch(() => {});
  }
}

/** Render satu fess → Cloudinary → URL siap publish. */
export async function renderFessImage(state: RenderState, publicId: string): Promise<string> {
  const buffer = await renderToBuffer(state);
  return uploadImage(buffer, publicId);
}
