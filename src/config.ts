/* =========================================================
   KONFIGURASI WORKER — satu sumber nama env + default.

   Semua env worker didefinisikan di sini agar tidak ada literal
   yang tersebar di file lain. Nilai tidak valid → default + log
   peringatan (tidak crash). Dipanggil sekali di `main()`.
========================================================= */
import { log } from './log';

/** Clamp nilai integer ke rentang, default jika parse gagal. */
function clampInt(raw: string | undefined, def: number, min: number, max: number): number {
  if (raw === undefined) return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    log(`env tidak valid (bukan angka), pakai default ${def}:`, raw);
    return def;
  }
  if (n < min || n > max) {
    log(`env di luar rentang [${min},${max}], pakai ${Math.min(Math.max(n, min), max)}:`, raw);
    return Math.min(Math.max(n, min), max);
  }
  return n;
}

export const LIMITS = {
  /** Batas pemakaian API untuk antrean normal (margin di bawah plafon 50). */
  QUOTA_SOFT_CAP: clampInt(process.env.QUOTA_SOFT_CAP, 45, 1, 50),

  /** Slot yang bebas dalam N jam ke depan dihitung sebagai kapasitas. */
  LOOKAHEAD_HOURS: clampInt(process.env.LOOKAHEAD_HOURS, 2, 0, 24),

  /** Item `rendered` lebih tua dari ini dilempar ke `waiting_manual`. */
  RENDERED_TTL_HOURS: clampInt(process.env.RENDERED_TTL_HOURS, 12, 1, 168),

  /** Maks post API per rolling jam (pacing). */
  MAX_PER_HOUR: clampInt(process.env.MAX_PER_HOUR, 6, 1, 50),

  /** TTL token magic link (jam). */
  WAITROOM_TOKEN_TTL_HOURS: clampInt(process.env.WAITROOM_TOKEN_TTL_HOURS, 12, 1, 168),

  /** Secret HMAC untuk token magic link Waiting Room. */
  WAITROOM_SECRET: process.env.WAITROOM_SECRET ?? '',

  /** Webhook notifikasi admin (Discord-compatible). Kosong = no-op. */
  WAITROOM_WEBHOOK_URL: process.env.WAITROOM_WEBHOOK_URL ?? '',

  /** Base URL web untuk menyusun link notifikasi. */
  WAITROOM_BASE_URL: process.env.WAITROOM_BASE_URL ?? '',
} as const;

export type Limits = typeof LIMITS;