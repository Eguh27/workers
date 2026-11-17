/* =========================================================
   SAPUAN ROW `processing` YANG DITINGGALKAN RUN MATI.

   `claimJob` hanya mengambil status `queued`. Tanpa sapuan ini, satu run yang
   mati di tengah job — timeout 10 menit, atau dibatalkan concurrency — meninggalkan
   row-nya berstatus `processing` selamanya: tidak `queued` (jadi tidak pernah
   diklaim lagi), tidak `failed` (jadi tidak ada yang menyadarinya). Menfess itu
   hilang diam-diam.
========================================================= */
import { WORKFLOW_TIMEOUT_MS } from './run-budget';

/** Row `processing` yang sudah sediam ini pasti milik run yang sudah mati:
 *  satu run tidak mungkin hidup melewati WORKFLOW_TIMEOUT_MS. Diberi kelonggaran
 *  5 menit supaya sapuan tidak pernah mencuri row dari run yang masih jalan. */
export const STALE_PROCESSING_MS = WORKFLOW_TIMEOUT_MS + 5 * 60_000;

/** Nasib row yang ditinggalkan run mati.
 *
 *  Dikembalikan ke antrean, KECUALI sudah kehabisan attempt. Tanpa batas itu,
 *  satu row yang selalu membuat run mati akan diklaim ulang tiap sapuan dan
 *  membunuh setiap run — persis livelock yang pernah terjadi dengan kuota habis,
 *  dan seluruh antrean di belakangnya tidak pernah tersentuh. */
export function staleClaimStatus(attempts: number, maxAttempts: number): 'queued' | 'failed' {
  return attempts + 1 >= maxAttempts ? 'failed' : 'queued';
}
