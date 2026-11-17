/* =========================================================
   SAPUAN ROW IN-PROGRESS YANG DITINGGALKAN RUN MATI.

   `claimJob` hanya mengambil status antrean (`queued`/`rendered`), jadi row
   yang sudah diklaim tetapi run-nya berhenti di tengah (timeout workflow atau
   dibatalkan concurrency) akan tetap in-progress selamanya: tidak pernah
   diklaim lagi dan tidak pernah jadi gagal, sehingga tidak ada yang menyadarinya.

   Konstan terpisah untuk render & publish supaya timeout workflow bisa beda
   (WP6: render 10 menit, publish 10 menit — sama tapi terpisah).
========================================================= */
import { WORKFLOW_TIMEOUT_MS } from './run-budget';
import { RENDER_WORKFLOW_TIMEOUT_MS } from './render-budget';

/** Row `processing` (legacy) / `publishing` yang sudah sediam ini pasti milik
 *  run yang sudah mati. Diberi kelonggaran 5 menit supaya sapuan tidak pernah
 *  mencuri row dari run yang masih jalan. */
export const STALE_PROCESSING_MS = WORKFLOW_TIMEOUT_MS + 5 * 60_000;

/** Row `rendering` yang sudah sediam ini pasti milik run render yang sudah mati. */
export const STALE_RENDER_MS = RENDER_WORKFLOW_TIMEOUT_MS + 5 * 60_000;

/** Alias untuk publish worker (lebih eksplisit di `publish.ts`). */
export const STALE_PUBLISH_MS = STALE_PROCESSING_MS;

/** Nasib row yang ditinggalkan run mati.
 *
 *  Dikembalikan ke antrean, KECUALI sudah kehabisan attempt. Tanpa batas itu,
 *  satu row yang selalu membuat run mati akan diklaim ulang tiap sapuan dan
 *  membunuh setiap run — persis livelock yang pernah terjadi dengan kuota habis,
 *  dan seluruh antrean di belakangnya tidak pernah tersentuh. */
export function staleClaimStatus(attempts: number, maxAttempts: number): 'queued' | 'failed' {
  return attempts + 1 >= maxAttempts ? 'failed' : 'queued';
}
