/* =========================================================
   KUOTA PUBLISH INSTAGRAM.

   Meta tidak konsisten soal angkanya, di satu halaman yang sama:
     • panduan Content Publishing, bagian "Rate Limit"      → 100 post / 24 jam
     • panduan yang sama, bagian carousel, ~50 baris di bawahnya → 50
     • referensi content_publishing_limit (quota_total)     → "currently 50"

   Yang dipakai enforcement adalah 50. Bukti dari akun ini sendiri (16 Nov 2026):
   quota_usage 50 dan quota_total 100, lalu media_publish ditolak 9/2207042 pada
   post ke-51 — pola yang sama dilaporkan developer lain sepanjang 2026.

   Karena itu plafon efektif = min(quota_total, 50). Kalau Meta benar-benar
   menaikkan plafon akun ini, angka 50 tetap dipakai: gagal ke arah aman
   (berhenti lebih awal) alih-alih menabrak limit dan membakar panggilan API.
========================================================= */
export const EFFECTIVE_PUBLISH_CEILING = 50;

/** Jendela kuota bergulir 24 jam, bukan reset tengah malam. */
const QUOTA_WINDOW_MS = 86_400_000;

export interface QuotaInfo {
  /** post yang sudah terbit dalam jendela berjalan (dari API) */
  usage: number;
  /** plafon yang benar-benar dipakai worker */
  total: number;
  /** sisa post yang boleh diterbitkan sekarang */
  remaining: number;
}

/** Baca balasan GET /<IG_ID>/content_publishing_limit?fields=quota_usage,config.
 *  Bentuk yang tidak dikenal → null, dan pemanggil lanjut saja (fail-open):
 *  lebih baik mencoba publish daripada berhenti karena parsing gagal. */
export function parsePublishingLimit(payload: unknown): QuotaInfo | null {
  const data = (payload as { data?: unknown } | null | undefined)?.data;
  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0] as { quota_usage?: unknown; config?: { quota_total?: unknown } };
  const usage = first?.quota_usage;
  const reported = first?.config?.quota_total;
  if (typeof usage !== 'number' || typeof reported !== 'number') return null;

  const total = Math.min(reported, EFFECTIVE_PUBLISH_CEILING);
  return { usage, total, remaining: Math.max(0, total - usage) };
}

/** Kapan satu slot kuota bebas lagi, dihitung dari data kita sendiri.
 *
 *  Kuota bergulir: slot yang dipakai `ceiling` publish terakhir kembali 24 jam
 *  setelah publish tertua di antara mereka. `null` berarti belum mencapai
 *  plafon (tidak ada yang perlu ditunggu). */
export function nextFreeSlot(publishTimes: Date[], ceiling: number): Date | null {
  if (ceiling <= 0 || publishTimes.length < ceiling) return null;

  const asc = [...publishTimes].sort((a, b) => a.getTime() - b.getTime());
  const oldestInWindow = asc[asc.length - ceiling];
  return new Date(oldestInWindow.getTime() + QUOTA_WINDOW_MS);
}
