/* =========================================================
   RENDER ANTREAN KE BERKAS LOKAL — untuk posting manual.

   Latar: kuota publish Instagram (50/24 jam) bisa habis sementara antrean
   masih panjang. Posting manual dari app Instagram TIDAK lewat
   `media_publish`, jadi tidak dihitung API (lihat catatan Kuota Instagram).
   Script ini menyiapkan berkasnya supaya pemilik bisa memposting sendiri.

   Urutan WAJIB mengikuti `created_at` — itulah urutan tayang yang adil.
   Gambar tetap di-upload ke Cloudinary kalau `image_url` belum ada, supaya
   papan menfess di web tetap menampilkan gambarnya.

   Status TIDAK diubah di sini. Row tetap `queued` sampai pemilik
   mengonfirmasi sudah diposting; itu yang mencegah posting dobel.
========================================================= */
import { mkdirSync, writeFileSync } from 'node:fs';
import { Client } from 'pg';
import { loadLocalEnv } from './env';
import { captionFor } from './templates/captions';
import { renderToBuffer, uploadImage, shutdownRenderer } from './render';
import { buildSlideStates } from './slide-plan';
import type { RenderState } from './templates/render';

/* .env lokal hanya pelengkap; env yang sudah ada tidak ditimpa. */
loadLocalEnv(new URL('../.env', import.meta.url));

export interface QueueRow {
  submission_code: string;
  content: string;
  template: string;
  bg_preset: string | null;
  custom_config: { decors?: string[]; from?: string; to?: string; slides?: string[]; slide_count?: number } | null;
}

export interface PlanItem {
  /** nomor urut 1..n, mengikuti `created_at` */
  no: number;
  code: string;
  /** nama berkas slide pertama, mis. "01-NW6K-9C7R.jpg" */
  file: string;
  /** caption Instagram — isi mentah, tanpa header from/to */
  caption: string;
  /** satu entri per slide; fess satu slide = panjang 1 */
  slides: { file: string; state: RenderState }[];
}

export type { RenderState };

const OUT_DIR = new URL('../postingan/', import.meta.url);

/** Susun rencana render. Murni: hanya mengubah bentuk data, urutan masukan
 *  dipertahankan apa adanya — pemanggil yang bertanggung jawab mengurutkan. */
export function buildPlan(rows: QueueRow[]): PlanItem[] {
  return rows.map((row, i) => {
    const no = String(i + 1).padStart(2, '0');
    const states = buildSlideStates(row);
    const multi = states.length > 1;
    const slides = states.map((state, s) => ({
      state,
      // fess multi-slide disimpan per slide supaya urutan posting manual jelas
      file: multi
        ? `${no}-${row.submission_code}-slide-${s + 1}.jpg`
        : `${no}-${row.submission_code}.jpg`,
    }));
    return {
      no: i + 1,
      code: row.submission_code,
      file: slides[0].file,
      caption: captionFor(row.content),
      slides,
    };
  });
}

function log(...args: unknown[]) { console.log('[render]', ...args); }

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[render] DATABASE_URL belum diset');
    process.exit(1);
  }

  const db = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const { rows } = await db.query<QueueRow & { id: string; image_url: string | null }>(
    `SELECT id, submission_code, content, template, bg_preset, custom_config, image_url
       FROM menfess
      WHERE status = 'queued'
      ORDER BY created_at`,
  );

  if (rows.length === 0) {
    log('antrean kosong — tidak ada yang dirender.');
    await db.end();
    return;
  }

  const plan = buildPlan(rows);
  mkdirSync(OUT_DIR, { recursive: true });
  log(`${plan.length} row akan dirender urut created_at → postingan/`);

  let uploaded = 0;
  for (const [i, item] of plan.entries()) {
    const row = rows[i];
    const t0 = Date.now();
    const urls: string[] = [];
    for (const slide of item.slides) {
      const buffer = await renderToBuffer(slide.state);
      writeFileSync(new URL(slide.file, OUT_DIR), buffer);
      if (!row.image_url) {
        urls.push(await uploadImage(
          buffer,
          item.slides.length > 1
            ? `menfess-${item.code}-slide-${urls.length + 1}`
            : `menfess-${item.code}-${Date.now()}`,
        ));
      }
    }

    if (row.image_url) {
      log(`${item.no}/${plan.length} ${item.code} — dirender ${item.slides.length} slide (upload dilewati)`);
    } else {
      await db.query(
        `UPDATE menfess SET image_url = $1, custom_config = custom_config || $2::jsonb, updated_at = now() WHERE id = $3`,
        [urls[0], JSON.stringify({ image_urls: urls, slide_count: urls.length }), row.id],
      );
      uploaded++;
      log(`${item.no}/${plan.length} ${item.code} — dirender ${item.slides.length} slide + upload (${Date.now() - t0}ms)`);
    }
  }

  const captions = plan
    .map((p) => `===== ${p.no}. ${p.code}  (${p.file}) =====\n${p.caption}\n`)
    .join('\n');
  writeFileSync(new URL('captions.txt', OUT_DIR), captions);

  const checklist = [
    `# Urutan posting manual — ${plan.length} menfess`,
    '',
    'Posting dari app Instagram, urut dari atas. Kuota API tidak terpakai',
    'karena posting manual tidak lewat media_publish.',
    '',
    ...plan.flatMap((p) => p.slides.length > 1
      ? p.slides.map((s, i) => `- [ ] ${p.no}. ${p.code} slide ${i + 1}/${p.slides.length} → \`${s.file}\``)
      : [`- [ ] ${p.no}. ${p.code} → \`${p.file}\``]),
    '',
    'Caption tiap post ada di `captions.txt`.',
  ].join('\n');
  writeFileSync(new URL('urutan.md', OUT_DIR), checklist);

  log(`selesai: ${plan.length} berkas di postingan/, ${uploaded} di-upload ke Cloudinary.`);
  log('status TIDAK diubah — row masih queued sampai kamu konfirmasi sudah diposting.');
  await shutdownRenderer();
  await db.end();
}

/* hanya jalan sebagai script, bukan saat diimpor tes */
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error('[render] FATAL:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
