/* =========================================================
   ANTREAN `menfess` — klaim atomik, pengembalian job, dan sapuan row
   yang ditinggalkan run mati. Semua SQL antrean ada di file ini;
   `render-worker.ts` dan `publish.ts` hanya mengatur urutan pemanggilannya.

   Status perpindahan yang dilayani di sini (lihat ORCHESTRATION.md §2.1):
     render : queued     → rendering
     publish: rendered   → publishing   (WP3; sekarang masih queued → processing)
   Satu fungsi dipakai kedua jalur supaya aturan klaim, attempt, dan sapuan
   tidak pernah bercabang dua salinan.
========================================================= */
import type { Client } from 'pg';
import { log, summaryLine } from './log';
import { staleClaimStatus } from './stale-claim';

/** Batas percobaan sebelum row dianggap gagal permanen. */
export const MAX_ATTEMPTS = 3;

/** Status tempat job menunggu, yaitu tujuan saat job dikembalikan. */
export type RequeueTarget = 'queued' | 'rendered';

/** Status "sedang dipegang satu run"; row di sini tidak pernah diklaim run
 *  lain sampai run pemiliknya selesai atau disapu. */
export type InProgressStatus = 'processing' | 'rendering' | 'publishing';

/** Status akhir untuk row yang kehabisan attempt. */
export type ExhaustedStatus = 'failed' | 'waiting_manual';

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

export interface RequeueOptions {
  /** Error sementara: job ditunda TANPA membakar attempt. */
  transient?: boolean;
  /** Status antrean yang dituju: `queued` untuk render, `rendered` untuk publish. */
  target: RequeueTarget;
}

/** Ambil satu row dari `from` secara atomik dan pindahkan ke `to`: dua worker
 *  tidak akan pernah mengambil row yang sama. Row yang sudah dicoba di run ini
 *  dikecualikan — requeue tidak mengubah `queued_at`, jadi tanpa itu row
 *  terdepan diklaim ulang terus sampai jatah run habis.
 *
 *  Urutan memakai `coalesce(queued_at, created_at)` supaya requeue admin
 *  (yang mengisi `queued_at = now()`) tidak menyerobot fess yang lebih baru,
 *  sementara row lama yang belum punya `queued_at` tetap urut `created_at`. */
export async function claimJob(
  db: Client,
  from: InProgressStatus | RequeueTarget,
  to: InProgressStatus,
  excludeIds: string[] = [],
): Promise<Job | null> {
  const { rows } = await db.query<Job>(
    `WITH next_job AS (
       SELECT id FROM menfess
       WHERE status = $1 AND NOT (id = ANY($3::uuid[]))
       ORDER BY coalesce(queued_at, created_at)
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE menfess SET status = $2, updated_at = now()
     FROM next_job WHERE menfess.id = next_job.id
     RETURNING menfess.id, menfess.submission_code, menfess.content,
               menfess.category, menfess.template, menfess.image_url,
               menfess.bg_preset, menfess.custom_config,
               menfess.publish_attempts`,
    [from, to, excludeIds],
  );
  return rows[0] ?? null;
}

/** Kembalikan job ke status antrean `target`, atau tandai gagal bila
 *  attempt-nya habis. Error transient (throttle IG, CDN lambat) ditunda TANPA
 *  menaikkan attempt, supaya tidak jadi `failed` hanya karena gangguan
 *  sementara. `queued_at` sengaja tidak disentuh: TTL menunggu harus dihitung
 *  dari kapan item masuk antrean, bukan dari kapan ia gagal dirender. */
export async function requeueOrFail(
  db: Client,
  job: Job,
  errorMessage: string,
  { transient = false, target }: RequeueOptions,
): Promise<void> {
  const attempts = transient ? job.publish_attempts : job.publish_attempts + 1;
  const exhausted = !transient && attempts >= MAX_ATTEMPTS;
  const status = exhausted ? 'failed' : target;
  await db.query(
    `UPDATE menfess SET status = $1, publish_attempts = $2, last_error = $3, updated_at = now() WHERE id = $4`,
    [status, attempts, errorMessage.slice(0, 500), job.id],
  );
  log(
    `job ${job.submission_code} ${transient ? 'ditunda (error transien)' : `gagal (${attempts}/${MAX_ATTEMPTS})`} → ${status}:`,
    errorMessage,
  );
  summaryLine(`⚠️ ${job.submission_code} → ${status}\n  ${errorMessage.slice(0, 200)}`);
}

/** Sapu row `status` yang ditinggalkan run mati.
 *
 *  `claimJob` hanya mengambil status antrean, jadi row yang sudah diklaim
 *  tetapi run-nya berhenti di tengah (timeout workflow atau dibatalkan
 *  concurrency) akan tetap in-progress selamanya — tidak pernah diklaim lagi
 *  dan tidak pernah jadi gagal, sehingga tidak ada yang menyadarinya.
 *
 *  Ambangnya lebih panjang dari umur maksimum satu run, jadi sapuan tidak
 *  mungkin mencuri row dari run yang masih hidup. Row yang sudah kehabisan
 *  attempt ditandai `onExhausted` supaya antrean tidak livelock; sisanya
 *  dikembalikan ke `requeueTo`. Sapuan tidak memanggil API luar sama sekali.
 */
export async function sweepStaleClaims(
  db: Client,
  status: InProgressStatus,
  staleMs: number,
  onExhausted: ExhaustedStatus = 'failed',
  requeueTo: RequeueTarget = 'queued',
): Promise<void> {
  const { rows } = await db.query<{ id: string; submission_code: string; publish_attempts: number }>(
    `SELECT id, submission_code, publish_attempts FROM menfess
      WHERE status = $1 AND updated_at < now() - ($2::int * interval '1 millisecond')`,
    [status, staleMs],
  );
  if (rows.length === 0) return;

  log(`${rows.length} row nyangkut di '${status}' (run mati) — disapu.`);
  for (const row of rows) {
    const exhausted = staleClaimStatus(row.publish_attempts, MAX_ATTEMPTS) === 'failed';
    const next = exhausted ? onExhausted : requeueTo;
    await db.query(
      `UPDATE menfess SET status = $1, publish_attempts = publish_attempts + 1,
              last_error = $2, updated_at = now()
        WHERE id = $3`,
      [next, 'run sebelumnya mati saat job ini diproses', row.id],
    );
    log(`job ${row.submission_code} nyangkut → ${next}`);
    summaryLine(`♻️ ${row.submission_code} nyangkut di ${status} → ${next}`);
  }
}

/** Pindahkan satu job ke `waiting_manual` (CMS) tanpa membakar attempt.
 *  Dipakai saat kuota habis, overflow, atau gagal permanen 3x di publish. */
export async function markWaitingManual(
  db: Client,
  job: Job,
  reason: string,
): Promise<void> {
  await db.query(
    `UPDATE menfess SET status = 'waiting_manual', last_error = $1, updated_at = now() WHERE id = $2`,
    [reason.slice(0, 500), job.id],
  );
  log(`job ${job.submission_code} → waiting_manual:`, reason);
  summaryLine(`📬 ${job.submission_code} → waiting_manual\n  ${reason.slice(0, 200)}`);
}
