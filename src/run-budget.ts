/* =========================================================
   ANGGARAN SATU RUN WORKER.

   Batas 3 job/run dinaikkan jadi 5 (16 Nov 2026) karena cron GitHub Actions
   ternyata jarang tepat waktu: dari publish nyata 06:41–10:54Z, 51 post
   selesai dalam 18 run ≈ 4 run/jam, sementara cron tiap 5 menit seharusnya 12
   run/jam. Yang membatasi kecepatan mengejar antrean jadi jumlah run, bukan
   jumlah job per run — dan hampir semua run itu mentok tepat di 3 job.

   Menaikkan angka ini TIDAK menaikkan plafon harian. Plafon tetap 50 post/24
   jam milik Instagram (lihat quota.ts); ini hanya membuat satu run
   menyelesaikan lebih banyak job saat slot kuota sedang longgar.
========================================================= */

export const MAX_JOBS_PER_RUN = 5;

/** Jeda antar post dalam satu run, penjaga anti-spam Instagram. Cadence per
 *  post tidak berubah saat jumlah job dinaikkan: tetap ~40 dtk sekali. */
export const BETWEEN_POSTS_DELAY_MS = 20_000;

/** Perkiraan biaya satu job DI LUAR jeda: render headless Chrome + upload
 *  Cloudinary + bikin container + polling sampai container siap.
 *  Diukur dari publish nyata 16 Nov 2026: jarak antar post dalam satu run
 *  38–42 dtk, dikurangi jeda 20 dtk → sisa ~20 dtk. */
export const PER_JOB_BUDGET_MS = 20_000;

/** Harus sama dengan `timeout-minutes: 10` di .github/workflows/publish.yml.
 *  Kalau run dibunuh di tengah jalan, job yang sudah diklaim tetap
 *  `processing` sampai cron berikutnya menyapunya. */
export const WORKFLOW_TIMEOUT_MS = 10 * 60_000;

/** Perkiraan durasi satu run: n job, dengan n-1 jeda (post terakhir tidak
 *  diikuti jeda). */
export function estimatedRunDurationMs(jobs: number = MAX_JOBS_PER_RUN): number {
  return jobs * PER_JOB_BUDGET_MS + Math.max(0, jobs - 1) * BETWEEN_POSTS_DELAY_MS;
}

/** Apakah `jobs` job masih muat dalam timeout workflow? */
export function fitsWorkflowTimeout(jobs: number = MAX_JOBS_PER_RUN): boolean {
  return estimatedRunDurationMs(jobs) <= WORKFLOW_TIMEOUT_MS;
}
