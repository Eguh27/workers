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
import { composeFess, MAX_DECORS } from './templates';
import { renderToBuffer, uploadImage, shutdownRenderer } from './render';
import type { RenderState } from './templates/render';

/* .env lokal hanya pelengkap; env yang sudah ada tidak ditimpa. */
loadLocalEnv(new URL('../.env', import.meta.url));

export interface QueueRow {
  submission_code: string;
  content: string;
  template: string;
  bg_preset: string | null;
  custom_config: { decors?: string[]; from?: string; to?: string } | null;
}

export interface PlanItem {
  /** nomor urut 1..n, mengikuti `created_at` */
  no: number;
  code: string;
  /** nama berkas relatif, mis. "01-NW6K-9C7R.jpg" */
  file: string;
  /** caption Instagram — isi mentah, tanpa header from/to */
  caption: string;
  /** state yang dipakai renderer (isi sudah lewat composeFess) */
  state: RenderState;
}

const OUT_DIR = new URL('../postingan/', import.meta.url);

/** Susun rencana render. Murni: hanya mengubah bentuk data, urutan masukan
 *  dipertahankan apa adanya — pemanggil yang bertanggung jawab mengurutkan. */
export function buildPlan(rows: QueueRow[]): PlanItem[] {
  return rows.map((row, i) => {
    const cfg = row.custom_config ?? {};
    const decors = (cfg.decors ?? []).slice(0, MAX_DECORS);
    return {
      no: i + 1,
      code: row.submission_code,
      file: `${String(i + 1).padStart(2, '0')}-${row.submission_code}.jpg`,
      caption: captionFor(row.content),
      state: {
        template: row.template as RenderState['template'],
        content: composeFess(row.content, cfg.from ?? '', cfg.to ?? ''),
        code: row.submission_code,
        decors: decors as RenderState['decors'],
        bg: row.bg_preset,
      },
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
    const buffer = await renderToBuffer(item.state);
    writeFileSync(new URL(item.file, OUT_DIR), buffer);

    if (row.image_url) {
      log(`${item.no}/${plan.length} ${item.code} — dirender (image_url sudah ada, upload dilewati)`);
    } else {
      const url = await uploadImage(buffer, `menfess-${item.code}-${Date.now()}`);
      await db.query(`UPDATE menfess SET image_url = $1, updated_at = now() WHERE id = $2`, [url, row.id]);
      uploaded++;
      log(`${item.no}/${plan.length} ${item.code} — dirender + upload (${Date.now() - t0}ms)`);
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
    ...plan.map((p) => `- [ ] ${p.no}. ${p.code} → \`${p.file}\``),
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
