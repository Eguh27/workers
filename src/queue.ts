/* =========================================================
   ANTREAN `menfess` — klaim atomik, pengembalian job, dan sapuan row
   yang ditinggalkan run mati. Semua SQL antrean ada di file ini;
   `publish.ts` hanya mengatur urutan pemanggilannya.
========================================================= */
import type { Client } from 'pg';
import { log, summaryLine } from './log';
import { STALE_PROCESSING_MS, staleClaimStatus } from './stale-claim';

/** Batas percobaan sebelum row dianggap gagal permanen. */
export const MAX_ATTEMPTS = 3;

/** Satu row antrean yang sudah diklaim run ini. */
export interface Job {
  id: string;
  submission_code: string;
  content: string;
  category: string;
  template: string;
  image_url: string | null;
  bg_preset: string | null;
  custom_config: { decors?: string[]; from?: string; to?: string } | null;
  publish_attempts: number;
}

/** Ambil satu row `queued` secara atomik: dua worker tidak akan pernah
 *  mengambil row yang sama. Row yang sudah dicoba di run ini dikecualikan —
 *  requeue tidak mengubah `created_at`, jadi tanpa itu row terdepan diklaim
 *  ulang terus sampai jatah run habis. */
export async function claimJob(db: Client, excludeIds: string[] = []): Promise<Job | null> {
  const { rows } = await db.query<Job>(
    `WITH next_job AS (
       SELECT id FROM menfess
       WHERE status = 'queued' AND NOT (id = ANY($1::uuid[]))
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE menfess SET status = 'processing', updated_at = now()
     FROM next_job WHERE menfess.id = next_job.id
     RETURNING menfess.id, menfess.submission_code, menfess.content,
               menfess.category, menfess.template, menfess.image_url,
               menfess.bg_preset, menfess.custom_config,
               menfess.publish_attempts`,
    [excludeIds],
  );
  return rows[0] ?? null;
}

/** Kembalikan job ke antrean, atau tandai `failed` bila attempt-nya habis.
 *  Error transient (throttle IG) ditunda TANPA menaikkan attempt, supaya
 *  tidak jadi `failed` hanya karena Instagram memblokir sementara. */
export async function requeueOrFail(
  db: Client,
  job: Job,
  errorMessage: string,
  transient = false,
): Promise<void> {
  const attempts = transient ? job.publish_attempts : job.publish_attempts + 1;
  const status = transient ? 'queued' : attempts >= MAX_ATTEMPTS ? 'failed' : 'queued';
  await db.query(
    `UPDATE menfess SET status = $1, publish_attempts = $2, last_error = $3, updated_at = now() WHERE id = $4`,
    [status, attempts, errorMessage.slice(0, 500), job.id],
  );
  log(`job ${job.submission_code} ${transient ? 'ditunda (throttle IG)' : `gagal (${attempts}/${MAX_ATTEMPTS})`} → ${status}:`, errorMessage);
  summaryLine(`⚠️ ${job.submission_code} → ${status}\n  ${errorMessage.slice(0, 200)}`);
}

/** Sapu row yang ditinggalkan run mati.
 *
 *  `claimJob` hanya mengambil status `queued`, jadi row yang sudah diklaim
 *  tapi run-nya berhenti di tengah (timeout workflow atau dibatalkan
 *  concurrency) akan berstatus `processing` selamanya — tidak pernah diklaim
 *  lagi dan tidak pernah jadi `failed`, sehingga tidak ada yang menyadarinya.
 *
 *  Ambangnya lebih panjang dari umur maksimum satu run (lihat stale-claim.ts),
 *  jadi sapuan ini tidak mungkin mencuri row dari run yang masih hidup. Row
 *  yang sudah kehabisan attempt ditandai `failed` supaya antrean tidak
 *  livelock. Sapuan tidak memanggil API Instagram sama sekali. */
export async function sweepStaleClaims(db: Client): Promise<void> {
  const { rows } = await db.query<{ id: string; submission_code: string; publish_attempts: number }>(
    `SELECT id, submission_code, publish_attempts FROM menfess
      WHERE status = 'processing' AND updated_at < now() - ($1::int * interval '1 millisecond')`,
    [STALE_PROCESSING_MS],
  );
  if (rows.length === 0) return;

  log(`${rows.length} row nyangkut di 'processing' (run mati) — disapu.`);
  for (const row of rows) {
    const status = staleClaimStatus(row.publish_attempts, MAX_ATTEMPTS);
    await db.query(
      `UPDATE menfess SET status = $1, publish_attempts = publish_attempts + 1,
              last_error = $2, updated_at = now()
        WHERE id = $3`,
      [status, 'run sebelumnya mati saat job ini diproses', row.id],
    );
    log(`job ${row.submission_code} nyangkut → ${status}`);
    summaryLine(`♻️ ${row.submission_code} nyangkut di processing → ${status}`);
  }
}
