/* Klasifikasi error Instagram: transient (ulangi lewat cron tanpa membakar
   attempt) vs permanen (hitung sebagai kegagalan).

   9004/2207052 berarti Meta gagal mengambil media URL. Jika file sudah lolos
   verifikasi lokal, ini lazimnya propagasi CDN sementara; retry memakai URL dan
   container baru pada cron berikutnya.

   2207042 ("Media Publish Limit Exceeded") adalah kuota publish harian milik IG.
   Kuota ini pulih sendiri, jadi tidak boleh membakar attempt — kalau dianggap
   permanen, satu kali kuota habis membuat seluruh antrean jadi `failed`. */
export function isTransientInstagramError(message: string): boolean {
  return /API access blocked|throttl|rate limit|request limit|\b9004\b|\b2207052\b|\b2207042\b|publish limit|too many actions|media download has failed|media could not be fetched/i.test(message);
}

/** Kuota publish akun benar-benar habis (bukan throttle biasa).
 *
 *  Ini adalah subset transient, tapi penanganannya berbeda: kuota habis
 *  memblokir SELURUH akun sampai jendela 24 jam bergulir, jadi run harus
 *  berhenti saat itu juga — bukan lanjut ke job berikutnya dengan harapan
 *  hasilnya beda, dan bukan pula menembak ulang tiap 5 menit. */
export function isPublishQuotaError(message: string): boolean {
  return /\b2207042\b|Media Publish Limit Exceeded|maximum number of posts|too many actions/i.test(message);
}
