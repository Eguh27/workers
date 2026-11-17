/* =========================================================
   WORKER PUBLISH — dijalankan GitHub Actions (dispatch/cron) atau lokal.
   Alur satu run:
     sapu row nyangkut → gerbang kuota → claim atomik →
     render (headless Chrome, markup & CSS persis preview situs) →
     upload Cloudinary → publish ke Instagram.
   Semua kredensial datang dari environment/secrets; lihat `.env.example`.
========================================================= */
import { Client } from 'pg';
import { loadLocalEnv, readWorkerEnv } from './env';
import { createInstagramClient, type InstagramClient } from './instagram';
import { fatal, log, summaryLine, writeSummary } from './log';
import { claimJob, requeueOrFail, sweepStaleClaims, type Job } from './queue';
import { EFFECTIVE_PUBLISH_CEILING, nextFreeSlot } from './quota';
import { BETWEEN_POSTS_DELAY_MS, MAX_JOBS_PER_RUN } from './run-budget';
import { renderFessImage, shutdownRenderer } from './render';
import { composeFess } from './templates';
import { captionFor } from './templates/captions';
import type { RenderState } from './templates/render';
import { isPublishQuotaError, isTransientInstagramError } from './transient-error';

/* .env lokal hanya pelengkap; secrets Actions sudah ada di process.env. */
loadLocalEnv(new URL('../.env', import.meta.url));

/** `stop` = kuota IG habis; sisa antrean tidak disentuh pada run ini. */
type ProcessResult = 'published' | 'handled' | 'stop';

/** Gerbang sebelum menyentuh antrean: kalau kuota publish akun habis, jangan
 *  klaim job sama sekali.
 *
 *  Tanpa ini worker menembak IG tiap run dengan error yang sama, dan pesan
 *  errornya sendiri ("performing too many actions") adalah sinyal anti-spam —
 *  justru cara tercepat membuat akun kena restriction. Satu panggilan API per
 *  run jauh lebih murah daripada membuat container yang pasti ditolak. */
async function quotaExhausted(db: Client, ig: InstagramClient): Promise<boolean> {
  const remaining = await ig.remainingPosts();
  if (remaining === null || remaining > 0) return false;

  const { rows } = await db.query<{ updated_at: Date }>(
    `SELECT updated_at FROM menfess WHERE status = 'published'
      ORDER BY updated_at DESC LIMIT $1`,
    [EFFECTIVE_PUBLISH_CEILING],
  );
  const free = nextFreeSlot(rows.map((row) => row.updated_at), EFFECTIVE_PUBLISH_CEILING);
  const kapan = free ? ` Slot pertama bebas ${free.toISOString()}.` : '';
  log(`kuota publish IG habis (plafon efektif ${EFFECTIVE_PUBLISH_CEILING}/24 jam).${kapan} Tidak ada job yang diklaim.`);
  summaryLine(`⏸️ kuota IG habis — run dilewati.${kapan}`);
  return true;
}

/** Pastikan row punya `image_url`. Render memakai `composeFess(content, from,
 *  to)` — teks yang sama dengan preview composer, bukan `content` mentah, dan
 *  caption Instagram tetap memakai `content` mentah. */
async function ensureImage(db: Client, job: Job): Promise<string> {
  if (job.image_url) return job.image_url;

  log('image belum ada — render via headless Chrome…');
  const config = job.custom_config ?? {};
  const imageUrl = await renderFessImage(
    {
      template: job.template as RenderState['template'],
      content: composeFess(job.content, config.from ?? '', config.to ?? ''),
      code: job.submission_code,
      decors: (config.decors ?? []) as RenderState['decors'],
      bg: job.bg_preset,
    },
    `menfess-${job.submission_code}-${Date.now()}`,
  );
  await db.query(`UPDATE menfess SET image_url = $1, updated_at = now() WHERE id = $2`, [imageUrl, job.id]);
  log('render + upload Cloudinary ✓', imageUrl.slice(0, 60) + '…');
  job.image_url = imageUrl;
  return imageUrl;
}

/** Terbitkan satu job yang gambarnya sudah ada, lalu simpan hasilnya. */
async function publishToInstagram(db: Client, ig: InstagramClient, job: Job, imageUrl: string): Promise<void> {
  const creationId = await ig.createContainer(imageUrl, captionFor(job.content));
  const mediaId = await ig.publishContainer(creationId);
  log('media_publish ✓', mediaId);

  const permalink = await ig.permalink(mediaId);
  // `ig_media_id` disimpan untuk rekonsiliasi dan referensi media.
  await db.query(
    `UPDATE menfess
        SET status = 'published', ig_permalink = $1, ig_media_id = $2,
            last_error = NULL, updated_at = now()
      WHERE id = $3`,
    [permalink, mediaId, job.id],
  );
  log(`✅ ${job.submission_code} PUBLISHED → ${permalink}`);
  summaryLine(`✅ ${job.submission_code} published → ${permalink}`);
}

/** Proses satu job. `stop` hanya untuk kuota IG habis agar sisa antrean
 *  tidak disentuh. */
async function processJob(db: Client, ig: InstagramClient, job: Job): Promise<ProcessResult> {
  log(`claim job ${job.submission_code} (${job.category}/${job.template}, attempt ${job.publish_attempts + 1})`);

  try {
    const imageUrl = await ensureImage(db, job);
    await ig.waitUntilImagePublic(imageUrl);

    // Kuota bisa habis di tengah run: berhenti sebelum membuat container
    // yang pasti ditolak, dan tunda job tanpa menambah attempt.
    const remaining = await ig.remainingPosts();
    if (remaining !== null && remaining <= 0) {
      await db.query(
        `UPDATE menfess SET status = 'queued', last_error = 'kuota IG habis, ditunda', updated_at = now() WHERE id = $1`,
        [job.id],
      );
      log('kuota publish IG habis — job dikembalikan ke antrean.');
      return 'stop';
    }

    await publishToInstagram(db, ig, job, imageUrl);
    return 'published';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Kuota akun habis → berhenti seketika. Sisa antrean tidak akan berhasil
    // juga, dan menembak terus hanya menambah sinyal anti-spam ke IG.
    if (isPublishQuotaError(message)) {
      await requeueOrFail(db, job, message, true);
      log('kuota publish IG habis — run dihentikan, sisa antrean menunggu jendela 24 jam bergulir.');
      return 'stop';
    }
    // Throttle IG dan kegagalan unduh media dari CDN bersifat sementara —
    // jangan bakar attempts; run berikutnya membuat container baru.
    await requeueOrFail(db, job, message, isTransientInstagramError(message));
    return 'handled';
  }
}

/** Jeda hanya diberikan setelah post benar-benar tayang: retry/error boleh
 *  lanjut supaya satu item CDN yang tertunda tidak menghambat antrean. */
async function pauseBetweenPosts(processed: number): Promise<void> {
  if (processed >= MAX_JOBS_PER_RUN) return;
  log(`jeda ${BETWEEN_POSTS_DELAY_MS / 1000} dtk sebelum job berikutnya…`);
  await new Promise((resolve) => setTimeout(resolve, BETWEEN_POSTS_DELAY_MS));
}

/** Inti satu run: sapuan dulu (tidak memanggil IG, jadi tetap jalan walau
 *  kuota habis), lalu loop klaim sampai jatah run habis atau antrean kosong. */
async function runQueue(db: Client, ig: InstagramClient): Promise<void> {
  // Row yang ditinggalkan run mati harus kembali ke antrean lebih dulu.
  await sweepStaleClaims(db);
  if (await quotaExhausted(db, ig)) return;

  let processed = 0;
  let published = 0;
  // Row yang sudah dicoba di run ini, supaya requeue tidak mengulang row depan.
  const tried: string[] = [];

  while (processed < MAX_JOBS_PER_RUN) {
    const job = await claimJob(db, tried);
    if (!job) {
      if (processed === 0) log('antrean kosong — tidak ada yang dipublish.');
      break;
    }
    tried.push(job.id);
    processed++;

    const result = await processJob(db, ig, job);
    if (result === 'published') published++;
    if (result === 'stop') break;
    if (result === 'published') await pauseBetweenPosts(processed);
  }

  log(`run selesai: ${processed}/${MAX_JOBS_PER_RUN} job diproses, ${published} published.`);
}

async function main(): Promise<void> {
  const env = readWorkerEnv();
  const ig = createInstagramClient(env.igToken, env.igUserId);
  const db = new Client({ connectionString: env.databaseUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();

  try {
    await runQueue(db, ig);
  } finally {
    writeSummary();
    await shutdownRenderer();
    await db.end();
  }
}

main().catch((err) => fatal(err instanceof Error ? err.message : String(err)));
