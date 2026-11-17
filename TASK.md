# TASK — pisahkan worker menjadi repo mandiri

## Tujuan

Memindahkan worker render & publish (render, workflow, dependensi) keluar dari
repo situs `umpomenfess` menjadi repo sendiri yang **publik**, mandiri, dan siap
di-push. Repo situs tetap memakai salinan markup template untuk preview.

Alasan: workflow publish berjalan tiap beberapa menit dan repo situs private,
sehingga menit GitHub Actions menjadi faktor pembatas. Repo publik tidak
menghabiskan kuota menit Actions, dan memisahkan worker membuat kredensial
produksi tidak lagi berada di repo yang sama dengan situs.

## Batasan

- Repo baru berada di luar folder proyek utama, sejajar dengannya
  (`../umpomenfess-worker`), dengan git history baru — bukan submodule.
- Repo baru tidak meng-import apa pun dari luar foldernya.
- Repo publik: tidak boleh ada secret, token, URL privat, atau data pribadi.
- Tidak ada trigger `pull_request` / `pull_request_target` di workflow.
- Tidak menghapus apa pun di repo situs sebelum pemilik menyetujui Tahap 6.

## Tahapan

| Tahap | Isi | Status |
|---|---|---|
| 1 | Audit file, dependensi silang, env → `AUDIT.md` | selesai |
| 2 | Bangun repo: salin file, modul dipisah, test, git history baru | selesai |
| 3 | Workflow: dispatch + manual + schedule fallback, permission minimal | selesai |
| 4 | Sapu secrets/pola kunci, `.env.example` dummy, `.gitignore` | selesai |
| 5 | `README.md`, `AGENTS.md`, `TASK.md`, `TODO.md` | selesai |
| 6 | Sambungkan repo situs (ubah target dispatch, hapus file worker lama) | **menunggu persetujuan pemilik** |
| 7 | Verifikasi: install, typecheck, test, render lokal, cek import keluar | selesai (lihat `TODO.md`) |

## Tahap 6 — usulan perubahan di repo situs (belum dieksekusi)

Dikerjakan hanya setelah pemilik setuju, sebagai commit terpisah di repo situs.

1. `src/pages/api/fess.ts` — arahkan `repository_dispatch` ke repo worker.
   - `GH_REPO` diisi `owner/umpomenfess-worker` (env var, bukan literal).
   - `event_type` menjadi `render-menfess` (harus sama dengan
     `repository_dispatch.types` di workflow worker).
   - Token diganti fine-grained PAT: akses hanya ke repo worker,
     izin **Contents: read and write** (dibutuhkan `repository_dispatch`),
     masa berlaku pendek, disimpan sebagai env Vercel `GH_PAT`.
   - Catat: `import.meta.env.GH_PAT`/`GH_REPO` di-inline saat build, jadi
     perubahan env wajib redeploy tanpa build cache.
2. Hapus dari repo situs: `worker/publish.ts`, `worker/render.ts`,
   `worker/render-entry.ts`, `worker/render-env.d.ts`,
   `worker/build-render-bundle.mjs`, `worker/quota.ts` (+tes),
   `worker/run-budget.ts` (+tes), `worker/stale-claim.ts` (+tes),
   `worker/transient-error.ts` (+tes), `worker/render-queue.ts` (+tes),
   `.github/workflows/publish.yml`.
3. Sesuaikan `package.json` repo situs: buang script `worker`, `render:bundle`,
   `render:queue`, dan tes worker dari `npm test`; buang dependensi yang hanya
   dipakai worker (`pg`, `puppeteer-core`, `cloudinary`, `esbuild`, `tsx` bila
   tidak dipakai tes lain, `@types/pg`).
4. Perbarui `ARCHITECTURE.md`, `DEPLOYMENT.md`, `AGENTS.md`, dan `.env.example`
   repo situs: worker sekarang ada di repo lain, secrets pindah ke sana,
   `.gitignore` situs tidak lagi perlu mengabaikan `worker/render-bundle.js`.
5. Tetap dipertahankan di repo situs: `src/lib/templates.ts`,
   `src/lib/templates/render.ts`, `src/lib/captions.ts`, dan
   `src/styles/templates.css` — dibutuhkan preview composer. Beri komentar bahwa
   salinannya hidup di repo worker dan harus disinkronkan.

## Keputusan yang diambil saat eksekusi

| Keputusan | Alasan | Risiko bila salah |
|---|---|---|
| `publish.ts` dipecah menjadi `publish.ts` + `queue.ts` + `instagram.ts` + `log.ts` | 361 baris dengan tiga tanggung jawab sekaligus sulit dirawat; SQL antrean dan HTTP Instagram jadi bisa dibaca terpisah | Perilaku sama tetapi struktur berbeda dari repo situs, sehingga diff tidak bisa dibandingkan baris per baris |
| `schedule` fallback 15 menit (dari 5 menit) | Publish normal dipicu `repository_dispatch`; cron hanya jaring pengaman, dan 15 menit memangkas run kosong | Bila dispatch sering gagal, antrean terlayani lebih lambat |
| `render-queue.ts` ikut pindah | Ia bergantung pada `render.ts` (Chrome + Cloudinary); meninggalkannya di repo situs berarti menduplikasi renderer | Repo situs kehilangan `npm run render:queue`; penggantinya ada di repo ini |
| `src/smoke-render.ts` ditambahkan | Satu-satunya cara memverifikasi pipeline render tanpa kredensial produksi, juga berguna bagi kontributor repo publik | Berkas tambahan yang harus ikut dirawat bila tanda tangan renderer berubah |
| `env.ts` dan `log.ts` diekstrak | Pola pemuatan `.env` dan penulisan ringkasan dipakai lebih dari satu entrypoint (`publish.ts`, `render-queue.ts`) | Tidak ada; keduanya kecil dan berperilaku sama |
