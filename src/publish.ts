/* =========================================================
   WORKER PUBLISH — Cron Publish terpisah dari render.

   Satu run:
     1. sweepStaleClaims('publishing') → rendered / waiting_manual
     2. sweep TTL rendered → waiting_manual (tanpa attempt)
     3. hitung kapasitas proyeksi + bound dengan ig.remainingPosts()
     4. overflow rendered → waiting_manual
     5. pacing: allowed = min(MAX_JOBS_PER_RUN, sisa_kuota, MAX_PER_HOUR - post_1jam)
     6. loop allowed × claim rendered→publishing → publish
        - sukses: published (via='api'), published_at=now(), jeda
        - kuota habis: job+sisa rendered → waiting_manual, stop
        - transient: rendered (tanpa attempt)
        - permanen <3x: rendered; >=3x: waiting_manual + notif
     7. notifikasi Waiting Room (cooldown 6 jam global + per item)
========================================================= */
import { Client } from 'pg';
import { loadLocalEnv, readPublishEnv } from './env';
import { createInstagramClient, type InstagramClient } from './instagram';
import { fatal, log, summaryLine, writeSummary } from './log';
import { claimJob, requeueOrFail, sweepStaleClaims, markWaitingManual, type Job } from './queue';
import { EFFECTIVE_PUBLISH_CEILING, nextFreeSlot } from './quota';
import { BETWEEN_POSTS_DELAY_MS, MAX_JOBS_PER_RUN } from './run-budget';
import { STALE_PUBLISH_MS } from './stale-claim';
import { LIMITS } from './config';
import { projectedCapacity, boundCapacity, publishedInWindow, freedWithin } from './capacity';
import { allowedThisRun } from './pacing';
import { ttlCutoff, isExpired } from './ttl';
import { readState, setQuotaBlockedUntil, setNotifiedAt, countWaitingManual } from './state';
import { notifyWaitingRoom } from './notify';
import { isPublishQuotaError, isTransientInstagramError } from './transient-error';
import { captionFor } from './templates/captions';
import { slideUrlsOf } from './slide-plan';

/* .env lokal hanya pelengkap; secrets Actions sudah ada di process.env. */
loadLocalEnv(new URL('../.env', import.meta.url));

/** Satu run publish: kembalikan jumlah item yang berhasil dipublish. */
async function runPublishQueue(db: Client, ig: InstagramClient): Promise<number> {
  // 1. Sapu row publishing basi (run mati)
  await sweepStaleClaims(db, 'publishing', STALE_PUBLISH_MS, 'waiting_manual', 'rendered');

  // 2. Sweep TTL: rendered lebih tua dari RENDERED_TTL_HOURS → waiting_manual
  const now = new Date();
  const cutoff = ttlCutoff({ now, ttlHours: LIMITS.RENDERED_TTL_HOURS });
  const { rows: ttlRows } = await db.query<{ id: string; submission_code: string }>(
    `SELECT id, submission_code FROM menfess
      WHERE status = 'rendered'
        AND coalesce(queued_at, created_at) < $1`,
    [cutoff.toISOString()],
  );
  if (ttlRows.length > 0) {
    log(`${ttlRows.length} item rendered melewati TTL ${LIMITS.RENDERED_TTL_HOURS} jam → waiting_manual`);
    for (const row of ttlRows) {
      await db.query(
        `UPDATE menfess SET status = 'waiting_manual', last_error = $1, updated_at = now() WHERE id = $2`,
        ['melewati TTL antrean', row.id],
      );
      summaryLine(`📬 ${row.submission_code} → waiting_manual (TTL)`);
    }
  }

  // 3. Ambil published_at untuk hitung kuota (hanya via='api')
  const { rows: pubRows } = await db.query<{ published_at: Date }>(
    `SELECT published_at FROM menfess
      WHERE status = 'published'
        AND published_via = 'api'
        AND published_at > now() - interval '24 hours'
      ORDER BY published_at ASC`,
  );
  const publishedTimes = pubRows.map((r) => r.published_at);

  // 4. Hitung kapasitas proyeksi
  const projected = projectedCapacity({
    times: publishedTimes,
    now,
    softCap: LIMITS.QUOTA_SOFT_CAP,
    ceiling: EFFECTIVE_PUBLISH_CEILING,
    lookaheadHours: LIMITS.LOOKAHEAD_HOURS,
  });

  // 5. Cek sisa kuota IG real-time untuk bound
  const igRemaining = await ig.remainingPosts();
  const capacity = boundCapacity(projected, igRemaining);

  // 6. Overflow: rendered di luar kapasitas → waiting_manual
  const { rows: renderedRows } = await db.query<Job>(
    `SELECT id, submission_code, content, category, template, image_url,
            bg_preset, custom_config, publish_attempts
       FROM menfess
      WHERE status = 'rendered'
      ORDER BY coalesce(queued_at, created_at) ASC`,
  );
  const overflowCount = Math.max(0, renderedRows.length - capacity);
  if (overflowCount > 0) {
    log(`${overflowCount} item rendered overflow (kapasitas ${capacity}) → waiting_manual`);
    for (let i = 0; i < overflowCount; i++) {
      await markWaitingManual(db, renderedRows[i], 'kuota IG penuh (overflow)');
    }
  }

  // 7. Update quota_blocked_until (kalau kapasitas 0, simpan nextFreeSlot)
  const nextFree = capacity <= 0 ? nextFreeSlot(publishedTimes, EFFECTIVE_PUBLISH_CEILING) : null;
  await setQuotaBlockedUntil(db, nextFree);

  // 8. Pacing: hitung post API 1 jam terakhir
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const publishedLastHour = publishedTimes.filter((t) => t > hourAgo).length;
  const allowed = allowedThisRun({
    maxPerRun: MAX_JOBS_PER_RUN,
    igRemaining: capacity,
    publishedLastHour,
    maxPerHour: LIMITS.MAX_PER_HOUR,
  });

  if (allowed === 0) {
    log(`pacing: 0 job diizinkan run ini (published_last_hour=${publishedLastHour}, max_per_hour=${LIMITS.MAX_PER_HOUR}, capacity=${capacity})`);
    return 0;
  }

  log(`kapasitas proyeksi=${projected}, bound=${capacity}, allowed_run=${allowed} (max_per_run=${MAX_JOBS_PER_RUN}, last_hour=${publishedLastHour})`);

  // 9. Loop publish
  let published = 0;
  const tried: string[] = [];
  let quotaExhaustedThisRun = false;

  for (let i = 0; i < allowed; i++) {
    const job = await claimJob(db, 'rendered', 'publishing', tried);
    if (!job) {
      log('antrean rendered kosong — tidak ada yang dipublish.');
      break;
    }
    tried.push(job.id);

    log(`claim job ${job.submission_code} (attempt ${job.publish_attempts + 1})`);

    try {
      if (!job.image_url) {
        log(`${job.submission_code} anomali: image_url null → kembali ke queued`);
        await requeueOrFail(db, job, 'image_url hilang, dirender ulang', { transient: false, target: 'queued' });
        continue;
      }

      // Semua slide harus bisa diunduh IG sebelum container dibuat: kegagalan
      // CDN di slide ke-3 lebih baik terlihat sebagai error transient daripada
      // carousel setengah jadi.
      const imageUrls = slideUrlsOf(job);
      for (const url of imageUrls) await ig.waitUntilImagePublic(url);

      // Cek kuota lagi sebelum create container
      const remaining = await ig.remainingPosts();
      if (remaining !== null && remaining <= 0) {
        // Job ini + semua sisa rendered → waiting_manual
        await db.query(
          `UPDATE menfess SET status = 'waiting_manual', last_error = 'kuota IG habis (overflow)', updated_at = now()
            WHERE id = $1`,
          [job.id],
        );
        for (let j = i + 1; j < renderedRows.length; j++) {
          if (!tried.includes(renderedRows[j].id)) {
            await markWaitingManual(db, renderedRows[j], 'kuota IG habis (overflow)');
          }
        }
        quotaExhaustedThisRun = true;
        break;
      }

      // Publish ke Instagram: >1 slide = carousel (child → parent), satu slide = alur lama
      const mediaId = imageUrls.length > 1
        ? await ig.createCarouselContainer(imageUrls, captionFor(job.content)).then(ig.publishContainer)
        : await ig.publishContainer(await ig.createContainer(imageUrls[0], captionFor(job.content)));
      log('media_publish ✓', mediaId);

      const permalink = await ig.permalink(mediaId);
      await db.query(
        `UPDATE menfess
            SET status = 'published',
                published_via = 'api',
                published_at = now(),
                ig_permalink = $1,
                ig_media_id = $2,
                last_error = NULL,
                updated_at = now()
          WHERE id = $3`,
        [permalink, mediaId, job.id],
      );
      log(`✅ ${job.submission_code} PUBLISHED → ${permalink}`);
      summaryLine(`✅ ${job.submission_code} published → ${permalink}`);
      published++;

      // Jeda anti-spam (kecuali post terakhir)
      if (i < allowed - 1) {
        log(`jeda ${BETWEEN_POSTS_DELAY_MS / 1000} dtk sebelum job berikutnya…`);
        await new Promise((resolve) => setTimeout(resolve, BETWEEN_POSTS_DELAY_MS));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Kuota IG habis (error 2207042) → stop seketika, sisa rendered → waiting_manual
      if (isPublishQuotaError(message)) {
        log('kuota publish IG habis (error 2207042) — run dihentikan');
        await markWaitingManual(db, job, 'kuota IG habis (overflow)');
        // Sisa rendered yang belum dicoba
        for (let j = i + 1; j < renderedRows.length; j++) {
          if (!tried.includes(renderedRows[j].id)) {
            await markWaitingManual(db, renderedRows[j], 'kuota IG habis (overflow)');
          }
        }
        quotaExhaustedThisRun = true;
        break;
      }

      // Transient (CDN, throttle) → kembali ke rendered TANPA attempt
      if (isTransientInstagramError(message)) {
        await requeueOrFail(db, job, message, { transient: true, target: 'rendered' });
        continue;
      }

      // Permanen → attempt+1
      const attempts = job.publish_attempts + 1;
      if (attempts >= 3) {
        await markWaitingManual(db, job, message);
      } else {
        await requeueOrFail(db, job, message, { transient: false, target: 'rendered' });
      }
    }
  }

  // 10. Notifikasi Waiting Room (cooldown 6 jam)
  if (!quotaExhaustedThisRun) {
    // Mungkin overflow/gagal 3x di atas sudah menambah waiting_manual
  }
  const waitingCount = await countWaitingManual(db);
  if (waitingCount > 0) {
    const state = await readState(db);
    const cooldownMs = 6 * 3_600_000; // 6 jam
    const globalCooldownOk = !state.last_notified_at || (now.getTime() - state.last_notified_at.getTime() > cooldownMs);

    // Cek per-item: apakah ada item waiting_manual tanpa last_notified_at atau >6 jam
    const { rows: notifyCandidates } = await db.query<{ id: string }>(
      `SELECT id FROM menfess
        WHERE status = 'waiting_manual'
          AND (last_notified_at IS NULL OR last_notified_at < $1)
        LIMIT 1`,
      [new Date(now.getTime() - cooldownMs).toISOString()],
    );
    const itemCooldownOk = notifyCandidates.length > 0;

    if (globalCooldownOk && itemCooldownOk && LIMITS.WAITROOM_WEBHOOK_URL && LIMITS.WAITROOM_BASE_URL && LIMITS.WAITROOM_SECRET) {
      log('mengirim notifikasi Waiting Room…');
      await notifyWaitingRoom({
        webhookUrl: LIMITS.WAITROOM_WEBHOOK_URL,
        baseUrl: LIMITS.WAITROOM_BASE_URL,
        secret: LIMITS.WAITROOM_SECRET,
        count: waitingCount,
        nextFree,
        ttlHours: LIMITS.WAITROOM_TOKEN_TTL_HOURS,
      });
      await setNotifiedAt(db, now);
      // Update last_notified_at untuk item yang belum punya
      await db.query(
        `UPDATE menfess SET last_notified_at = now()
          WHERE status = 'waiting_manual' AND last_notified_at IS NULL`,
      );
    } else if (!globalCooldownOk) {
      log('notifikasi Waiting Room dilewati: cooldown global 6 jam');
    } else if (!itemCooldownOk) {
      log('notifikasi Waiting Room dilewati: cooldown per item 6 jam');
    } else {
      log('notifikasi Waiting Room: WAITROOM_WEBHOOK_URL/Base/Secret belum lengkap');
    }
  }

  // Reset quota_blocked_until kalau sudah tidak diblokir
  if (capacity > 0) {
    await setQuotaBlockedUntil(db, null);
  }

  log(`run publish selesai: ${published} published, ${tried.length} diproses.`);
  return published;
}

async function main(): Promise<void> {
  const env = readPublishEnv();
  const ig = createInstagramClient(env.igToken, env.igUserId);
  const db = new Client({ connectionString: env.databaseUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();

  try {
    await runPublishQueue(db, ig);
  } finally {
    writeSummary();
    await db.end();
  }
}

main().catch((err) => fatal(err instanceof Error ? err.message : String(err)));