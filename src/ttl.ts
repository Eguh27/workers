/* =========================================================
   TTL SWEEP — fungsi murni, tanpa akses DB/network.

   Item `rendered` yang menunggu lebih dari RENDERED_TTL_HOURS
   dipindahkan ke `waiting_manual` tanpa membakar attempt.
========================================================= */

export interface TTLInput {
  now: Date;
  ttlHours: number;
}

/** Waktu cutoff: item dengan `queued_at` (atau `created_at` fallback)
 *  lebih tua dari ini dianggap expired. */
export function ttlCutoff(input: TTLInput): Date {
  return new Date(input.now.getTime() - input.ttlHours * 3_600_000);
}

/** Cek apakah item sudah melewati TTL. */
export function isExpired(queuedAt: Date | null, createdAt: Date, input: TTLInput): boolean {
  const ref = queuedAt ?? createdAt;
  return ref.getTime() < ttlCutoff(input).getTime();
}