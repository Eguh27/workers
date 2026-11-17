/* =========================================================
   PACING — fungsi murni, tanpa akses DB/network.

   Menentukan berapa job yang boleh diproses run ini supaya
   tidak melebihi MAX_PER_HOUR per rolling jam.
========================================================= */

export interface PacingInput {
  maxPerRun: number;
  igRemaining: number | null;
  publishedLastHour: number;
  maxPerHour: number;
}

/** Jumlah job yang boleh dipublish run ini.
 *
 *  - `maxPerRun`: batas infrastruktur (MAX_JOBS_PER_RUN = 5).
 *  - `igRemaining`: sisa kuota IG real-time (null = tidak terbatas oleh API).
 *  - `publishedLastHour`: post API dalam 60 menit terakhir.
 *  - `maxPerHour`: batas pacing per jam (MAX_PER_HOUR).
 *
 *  Jika 0, run selesai tanpa error (cron berikutnya akan coba lagi). */
export function allowedThisRun(input: PacingInput): number {
  const { maxPerRun, igRemaining, publishedLastHour, maxPerHour } = input;
  const headroomHourly = Math.max(0, maxPerHour - publishedLastHour);
  const cap = igRemaining === null ? maxPerRun : Math.min(maxPerRun, igRemaining);
  return Math.max(0, Math.min(cap, headroomHourly));
}