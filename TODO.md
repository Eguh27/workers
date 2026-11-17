# TODO

Urut dari yang memblokir publish sampai perawatan.

## 1. Repo publik (pemilik, sekali jalan)

- [ ] Buat repo GitHub **public** `umpomenfess-worker` (tanpa README bawaan).
- [ ] `git remote add origin <url>` lalu `git push -u origin main`.
- [ ] Settings → Features: **matikan** Issues, Discussions, Projects, Wiki.
      Repo ini tidak menerima kontribusi lewat GitHub; permukaan serangan
      dipersempit.
- [ ] Settings → Actions → General:
      - Fork pull request workflows → **Require approval for all outside
        collaborators** (paling ketat; jaring pengaman walau workflow ini tidak
        punya trigger PR).
      - Workflow permissions → **Read repository contents**.
- [ ] Settings → Secrets and variables → Actions: isi enam repository secret
      (`DATABASE_URL`, `IG_USER_ID`, `IG_ACCESS_TOKEN`,
      `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`).
      Nilainya **sama** dengan yang sekarang ada di secrets repo situs.
- [ ] Setelah secrets terisi dan dispatch diuji: hapus secrets worker yang lama
      di repo situs (jangan sebelum Tahap 6 selesai — publish akan mati).

## 2. Token untuk memicu worker

- [ ] Buat **fine-grained PAT**: hanya repo `umpomenfess-worker`,
      izin **Contents: read and write** (syarat `repository_dispatch`),
      tidak ada izin lain, masa berlaku pendek.
- [ ] Simpan sebagai `GH_PAT` di Vercel, dan `GH_REPO` = `owner/umpomenfess-worker`.
- [ ] Redeploy Vercel **tanpa** "Use existing Build Cache": kedua nilai
      di-inline saat build oleh `import.meta.env`.
- [ ] Cabut PAT lama yang masih hidup setelah dispatch baru terbukti jalan.

## 3. Tahap 6 — sambungkan repo situs

Belum dikerjakan; menunggu persetujuan pemilik. Rincian di `TASK.md`.

- [ ] Setujui daftar perubahan `TASK.md` → Tahap 6.
- [ ] Ubah target `repository_dispatch` + `event_type` di `src/pages/api/fess.ts`.
- [ ] Hapus `worker/` dan `.github/workflows/publish.yml` dari repo situs.
- [ ] Bersihkan `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`
      repo situs dari sisa worker.
- [ ] Perbarui `ARCHITECTURE.md`, `DEPLOYMENT.md`, `AGENTS.md` repo situs.

## 4. Verifikasi yang sudah dilakukan di repo ini

- [x] `npm install` bersih, `package-lock.json` ikut ter-commit.
- [x] `npm test` → 35 tes lulus (30 salinan + 5 tes `env.ts`).
- [x] `npm run typecheck` → bersih.
- [x] `npm run render:bundle` → `src/render-bundle.js` (19 kB).
- [x] `npm run smoke` → 3 JPEG 1080×1350 di `postingan/`, template langit
      diperiksa secara visual (teks, header from/to, emoji, printilan).
- [x] Tidak ada import yang menunjuk ke luar repo (`grep` seluruh `src/`).
- [x] Worker tanpa env berhenti dengan pesan jelas, bukan crash acak.

## 5. Belum bisa diverifikasi di sini

- [ ] `npm ci` di runner bersih dengan Node 22 (lokal memakai Node 26).
- [ ] Pemanggilan Instagram sungguhan (`media`, `media_publish`,
      `content_publishing_limit`) — butuh token asli.
- [ ] Upload Cloudinary sungguhan — butuh kredensial asli.
- [ ] Perilaku cron/dispatch GitHub sungguhan, termasuk `concurrency`.
- [ ] `sudo apt-get install fonts-noto-color-emoji` di runner (lokal sudah
      punya font emoji, jadi yang diuji emoji lokal, bukan langkah CI-nya).

## 6. Perawatan berkala

- [ ] Token Instagram kedaluwarsa ± 15 Januari 2027 — perpanjang sebelum itu.
- [ ] Batas 50 post/24 jam: pantau `src/quota.ts` bila Meta menaikkan plafon
      akun ini.
- [ ] Bila template di repo situs berubah, salin empat berkas ke repo ini
      (peta di `README.md`).
- [ ] Bila `MAX_JOBS_PER_RUN` diubah, `timeout-minutes` workflow dan tes
      `src/run-budget.test.ts` harus ikut diperiksa.
