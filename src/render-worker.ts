/* =========================================================
   WORKER RENDER — entrypoint Cron Render.

   Satu run hanya merender + upload Cloudinary, lalu memindahkan row
   `queued → rendered`. Instagram TIDAK disentuh sama sekali di sini: file ini
   tidak mengimpor modul klien Instagram maupun `quota.ts`, jadi tidak ada
   jalur kode yang bisa membuat container atau menghitung kuota publish.

   Pemisahan ini yang membuat render bisa sering (cron 5 menit) tanpa
   menambah sinyal anti-spam ke Instagram; publish punya ritmenya sendiri.
========================================================= */
import { Client } from 'pg';
import { loadLocalEnv, readRenderEnv } from './env';
import { fatal, log, summaryLine, writeSummary } from './log';
import { claimJob, requeueOrFail, sweepStaleClaims, type Job } from './queue';
import { MAX_RENDER_PER_RUN, STALE_RENDER_MS } from './render-budget';
import { renderFessImage, shutdownRenderer } from './render';
import { composeFess } from './templates';
import type { RenderState } from './templates/render';

/* .env lokal hanya pelengkap; secrets Actions sudah ada di process.env. */
loadLocalEnv(new URL('../.env', import.meta.url));

/** Render satu job. Markup memakai `composeFess(content, from, to)` — teks
 *  yang sama dengan preview composer, bukan `content` mentah. Caption
 *  Instagram tetap dari `content` mentah dan dibuat di jalur publish. */
function renderJob(job: Job): Promise<string> {
  const config = job.custom_config ?? {};
  return renderFessImage(
    {
      template: job.template as RenderState['template'],
      content: composeFess(job.content, config.from ?? '', config.to ?? ''),
      code: job.submission_code,
      decors: (config.decors ?? []) as RenderState['decors'],
      bg: job.bg_preset,
    },
    `menfess-${job.submission_code}-${Date.now()}`,
  );
}

/** Simpan hasil render. `last_error` dibersihkan supaya kegagalan render
 *  sebelumnya tidak terbaca sebagai masalah pada row yang sudah siap tayang. */
async function markRendered(db: Client, job: Job, imageUrl: string): Promise<void> {
  await db.query(
    `UPDATE menfess
        SET image_url = $1, status = 'rendered', last_error = NULL, updated_at = now()
      WHERE id = $2`,
    [imageUrl, job.id],
  );
  log(`${job.submission_code} dirender ✓`, imageUrl.slice(0, 60) + '…');
  summaryLine(`🖼️ ${job.submission_code} → rendered`);
}

/** Inti satu run: sapuan dulu (row milik run mati kembali ke `queued`), lalu
 *  loop klaim sampai jatah run habis atau antrean kosong. */
async function runRenderQueue(db: Client): Promise<void> {
  await sweepStaleClaims(db, 'rendering', STALE_RENDER_MS, 'failed');

  let processed = 0;
  let rendered = 0;
  // Row yang sudah dicoba di run ini: requeue tidak mengubah `queued_at`, jadi
  // tanpa pengecualian ini row terdepan diklaim ulang sampai jatah habis.
  const tried: string[] = [];

  while (processed < MAX_RENDER_PER_RUN) {
    const job = await claimJob(db, 'queued', 'rendering', tried);
    if (!job) {
      if (processed === 0) log('antrean kosong — tidak ada yang dirender.');
      break;
    }
    tried.push(job.id);
    processed++;
    log(`claim job ${job.submission_code} (${job.template}, attempt ${job.publish_attempts + 1})`);

    const startedAt = Date.now();
    try {
      const imageUrl = await renderJob(job);
      await markRendered(db, job, imageUrl);
      rendered++;
      log(`upload Cloudinary ✓ (${Date.now() - startedAt}ms)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Gagal render tidak pernah transient di sini: Chrome/Cloudinary yang
      // rusak perlu terlihat sebagai attempt yang terbakar, bukan ditunda
      // selamanya sampai antrean membusuk.
      await requeueOrFail(db, job, message, { target: 'queued' });
    }
  }

  log(`run render selesai: ${processed}/${MAX_RENDER_PER_RUN} job diproses, ${rendered} rendered.`);
}

async function main(): Promise<void> {
  const env = readRenderEnv();
  const db = new Client({ connectionString: env.databaseUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();

  try {
    await runRenderQueue(db);
  } finally {
    writeSummary();
    await shutdownRenderer();
    await db.end();
  }
}

main().catch((err) => fatal(err instanceof Error ? err.message : String(err)));
