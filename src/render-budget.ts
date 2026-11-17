/* =========================================================
   ANGGARAN SATU RUN RENDER (Cron Render).

   Cron Render hanya merender + upload Cloudinary; tidak menyentuh Instagram.
   Batas di sini sengaja terpisah dari `run-budget.ts` (jalur publish): render
   tidak punya jeda anti-spam antar job, jadi jumlah job per run dan sisa
   anggaran timeout-nya berbeda.
========================================================= */

/** Jumlah job yang dirender satu run. Render hanya Chrome + Cloudinary
 *  (~5–8 dtk/job), jadi satu run masih lega di bawah timeout; cron berikutnya
 *  (5 menit) melanjutkan sisa antrean. */
export const MAX_RENDER_PER_RUN = 10;

/** Harus sama dengan `timeout-minutes: 10` di `.github/workflows/render.yml`
 *  (dibuat WP6). Kalau run dibunuh di tengah jalan, job yang sudah diklaim
 *  tetap `rendering` sampai sapuan berikutnya mengembalikannya ke `queued`. */
export const RENDER_WORKFLOW_TIMEOUT_MS = 10 * 60_000;

/** Row `rendering` yang sudah sediam ini pasti milik run yang sudah mati:
 *  satu run tidak mungkin hidup melewati RENDER_WORKFLOW_TIMEOUT_MS. Diberi
 *  kelonggaran 5 menit supaya sapuan tidak pernah mencuri row dari run yang
 *  masih hidup. */
export const STALE_RENDER_MS = RENDER_WORKFLOW_TIMEOUT_MS + 5 * 60_000;
