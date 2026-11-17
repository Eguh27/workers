/* =========================================================
   HITUNG KAPASITAS PUBLISH — fungsi murni, tanpa akses DB/network.

   Dipakai oleh Cron Publish untuk menentukan berapa item `rendered`
   yang boleh diproses run ini tanpa menghabiskan slot hari esok.
========================================================= */
import { EFFECTIVE_PUBLISH_CEILING } from './quota';

const WINDOW_MS = 86_400_000; // 24 jam
const HOUR_MS = 3_600_000;

export interface CapacityInput {
  /** `published_at` row `published_via='api'` dalam 24 jam terakhir (asc). */
  times: Date[];
  now: Date;
  softCap: number;
  ceiling: number;
  lookaheadHours: number;
}

/** Jumlah post yang sudah terbit di jendela 24 jam berjalan. */
export function publishedInWindow(times: Date[], now: Date, windowMs = WINDOW_MS): number {
  const cutoff = now.getTime() - windowMs;
  return times.filter((t) => t.getTime() > cutoff).length;
}

/** Jumlah post yang akan berumur >= 24 jam dalam `lookaheadMs` ke depan.
 *
 *  Post yang `published_at + 24jam` berada di rentang `(now, now+lookahead]`
 *  akan membebaskan slot di masa depan dekat. */
export function freedWithin(
  times: Date[],
  now: Date,
  lookaheadHours: number,
  windowMs = WINDOW_MS,
): number {
  if (lookaheadHours <= 0) return 0;
  const nowMs = now.getTime();
  const limit = nowMs + lookaheadHours * HOUR_MS;
  return times.filter((t) => {
    const freeAt = t.getTime() + windowMs;
    return freeAt > nowMs && freeAt <= limit;
  }).length;
}

/** Kapasitas proyeksi untuk run ini.
 *
 *  rumus: max(0, min(softCap, ceiling) - used) + freed
 *  - `softCap` margin aman di bawah plafon (default 45).
 *  - `ceiling` plafon efektif Instagram (50).
 *  - `used` = post_api_24h_terakhir.
 *  - `freed` = post yang akan bebas dalam `lookaheadHours`. */
export function projectedCapacity(input: CapacityInput): number {
  const used = publishedInWindow(input.times, input.now);
  const maxAllowed = Math.min(input.softCap, input.ceiling);
  const headroom = Math.max(0, maxAllowed - used);
  const freed = freedWithin(input.times, input.now, input.lookaheadHours);
  return headroom + freed;
}

/** Batasi kapasitas proyeksi dengan sisa kuota IG real-time.
 *
 *  `igRemaining` bisa `null` (fail-open). Kalau null → pakai proyeksi.
 *  Kalau ada → ambil yang lebih kecil. */
export function boundCapacity(projected: number, igRemaining: number | null): number {
  if (igRemaining === null) return projected;
  return Math.min(projected, igRemaining);
}