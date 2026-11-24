/* =========================================================
   DRY RUN RENDER SLIDE → CLOUDINARY (TANPA INSTAGRAM).

   Tujuan: membuktikan satu fess bisa jadi N slide, ter-upload
   dengan public_id `menfess-{code}-slide-{n}`, dan array URL-nya
   berurutan. TIDAK memanggil Graph API sama sekali.

   Pakai:
     tsx worker/render-slides.ts                 # row multi-slide terakhir dari DB
     tsx worker/render-slides.ts --code AB2D-CD34
     tsx worker/render-slides.ts --text "teks panjang..."   # tanpa DB
     tsx worker/render-slides.ts --text-file teks.txt

   Keluaran: daftar URL + ringkasan JSON {slide_count, image_urls}.
======================================================== */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { loadLocalEnv } from './env';
import { buildSlideStates } from './slide-plan';
import { renderFessImage, shutdownRenderer } from './render';
import { splitSlides } from './split-slides';
import type { SlideRow } from './slide-plan';

loadLocalEnv(new URL('../.env', import.meta.url));

function log(...args: unknown[]) { console.log('[dry-run]', ...args); }

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

/** Susun row buatan: teks panjang dipecah otomatis seperti composer. */
function syntheticRow(text: string, template: string, decors: string[]): SlideRow {
  const slides = splitSlides(text);
  return {
    submission_code: `DRY-${Date.now().toString(36).toUpperCase().slice(-4)}`,
    content: slides.join('\n\n'),
    template,
    bg_preset: arg('bg'),
    custom_config: {
      ...(decors.length ? { decors } : {}),
      ...(arg('from') ? { from: arg('from') } : {}),
      ...(arg('to') ? { to: arg('to') } : {}),
      ...(slides.length > 1 ? { slides, slide_count: slides.length } : {}),
    },
  };
}

async function rowFromDb(code: string | null): Promise<SlideRow> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL belum diset — pakai --text untuk uji tanpa DB');
  const db = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const { rows } = code
      ? await db.query<SlideRow>(
          `SELECT submission_code, content, template, bg_preset, custom_config
             FROM menfess WHERE submission_code = $1 LIMIT 1`, [code])
      : await db.query<SlideRow>(
          `SELECT submission_code, content, template, bg_preset, custom_config
             FROM menfess
            WHERE custom_config ? 'slides'
            ORDER BY created_at DESC LIMIT 1`);
    if (!rows[0]) throw new Error(code ? `row ${code} tidak ada` : 'tidak ada row multi-slide di DB');
    return rows[0];
  } finally {
    await db.end();
  }
}

async function main(): Promise<void> {
  const textArg = arg('text') ?? (arg('text-file') ? readFileSync(arg('text-file')!, 'utf8') : null);
  const template = arg('template') ?? 'langit';
  const decors = (arg('decors') ?? '').split(',').filter(Boolean);

  const row = textArg
    ? syntheticRow(textArg, template, decors)
    : await rowFromDb(arg('code'));

  const states = buildSlideStates(row);
  log(`fess ${row.submission_code}: ${states.length} slide (template ${row.template})`);

  const urls: string[] = [];
  for (const [i, state] of states.entries()) {
    const publicId = states.length > 1
      ? `menfess-${row.submission_code}-slide-${i + 1}`
      : `menfess-${row.submission_code}-${Date.now()}`;
    const url = await renderFessImage(state, publicId);
    urls.push(url);
    log(`slide ${i + 1}/${states.length} → ${url}`);
  }

  log('--- hasil ---');
  console.log(JSON.stringify({ submission_code: row.submission_code, slide_count: urls.length, image_urls: urls }, null, 2));
  log('TIDAK ada panggilan Instagram — verifikasi URL di atas dulu.');
}

main()
  .catch((err) => {
    console.error('[dry-run] FATAL:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => shutdownRenderer());
