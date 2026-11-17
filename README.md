# umpomenfess-worker

Worker render & publish untuk [@umpomenfess](https://instagram.com/umpomenfess) —
menfess anonim mahasiswa Universitas Muhammadiyah Ponorogo.

Repo ini **hanya** berisi worker. Situs, composer, dan API submit tinggal di repo
`umpomenfess` (Astro di Vercel). Worker dan situs berbagi satu hal: tampilan
kartu menfess. Salinan markup & CSS-nya ada di sini supaya worker bisa berjalan
sendiri sebagai repo publik tanpa meng-import apa pun dari luar.

## Yang dikerjakan satu run

```text
database (tabel menfess)
  └─ sapu row `processing` yang ditinggalkan run mati
       └─ gerbang kuota Instagram (berhenti sebelum menyentuh antrean)
            └─ claim atomik: queued → processing  (FOR UPDATE SKIP LOCKED)
                 └─ render headless Chrome 540×675 @2x → JPEG 1080×1350
                      └─ upload Cloudinary (URL publik HTTPS)
                           └─ Instagram Login Graph API (graph.instagram.com/v21.0)
                                └─ published + permalink + ig_media_id
```

Status: `queued → processing → published`, dan `failed` setelah tiga attempt.
Error sementara (throttle IG, CDN belum siap, kuota publish habis) dikembalikan
ke `queued` **tanpa** menambah attempt.

Satu run memproses maksimal `MAX_JOBS_PER_RUN` (5) job dengan jeda 20 detik
antar post; angka dan alasannya ada di `src/run-budget.ts`.

## Pemicu

| Pemicu | Kapan |
|---|---|
| `repository_dispatch` tipe `render-menfess` | dikirim `POST /api/fess` di repo situs setiap ada kiriman baru |
| `workflow_dispatch` | manual dari tab Actions |
| `schedule` `*/15 * * * *` | jaring pengaman: retry, dispatch yang gagal, dan job yang tersisa |

Tidak ada trigger `pull_request` / `pull_request_target`: workflow ini memegang
kredensial produksi, jadi tidak boleh pernah menjalankan kode dari PR.

## Secrets yang harus diisi

Settings → Secrets and variables → Actions → **Repository secrets**:

| Secret | Isi |
|---|---|
| `DATABASE_URL` | connection string Postgres Supabase (bukan URL REST) |
| `IG_USER_ID` | id akun Instagram bisnis |
| `IG_ACCESS_TOKEN` | token Instagram Login (bukan Facebook Login) |
| `CLOUDINARY_CLOUD_NAME` | nama cloud |
| `CLOUDINARY_API_KEY` | API key |
| `CLOUDINARY_API_SECRET` | API secret |

Tidak ada secret lain. Worker tidak butuh `SUPABASE_SERVICE_ROLE_KEY`, `GH_PAT`,
atau kunci situs: database diakses langsung lewat `DATABASE_URL`.

## Menjalankan lokal

```bash
npm ci
cp .env.example .env      # isi nilainya; .env di-ignore git
npm run render:bundle     # src/render-bundle.js
npm test                  # 35 tes, tanpa credential
npm run typecheck
```

Render tanpa database dan tanpa kredensial (butuh Chrome/Chromium):

```bash
npm run smoke             # → postingan/smoke-{langit,kaca,stiker}.jpg
```

`npm run smoke` adalah cara termurah memastikan pipeline render utuh. Hasilnya
harus 1080×1350 piksel dan berisi teks, emoji, serta printilan.

Menjalankan worker sungguhan (memanggil Instagram, jadi hati-hati):

```bash
npm run worker            # butuh DATABASE_URL, IG_*, CLOUDINARY_*, Chrome
```

Chrome dicari lewat `CHROME_PATH` lalu lokasi umum (`/usr/bin/google-chrome-stable`,
`/usr/bin/chromium`, …). Runner GitHub Actions sudah punya `google-chrome-stable`;
lokal cukup `CHROME_PATH=$(which chromium)`.

Alat bantu: render antrean `queued` ke berkas lokal untuk posting manual.

```bash
npm run render:queue      # → postingan/ + captions.txt + urutan.md
```

Status row **tidak** diubah oleh alat ini; row tetap `queued` sampai pemilik
mengonfirmasi sudah diposting manual, sehingga tidak ada posting dobel.

## Struktur

```text
.github/workflows/publish.yml   workflow tunggal: dispatch/cron/manual
src/publish.ts                  orkestrasi satu run
src/queue.ts                    SQL antrean: claim, requeue, sapuan row nyangkut
src/instagram.ts                klien Graph API + polling container
src/render.ts                   Chrome headless + upload Cloudinary
src/render-entry.ts             entry bundle browser
src/build-render-bundle.mjs     esbuild → src/render-bundle.js
src/quota.ts                    plafon 50 post/24 jam, slot bebas berikutnya
src/run-budget.ts               jatah job per run + anggaran timeout
src/stale-claim.ts              ambang sapuan row `processing`
src/transient-error.ts          klasifikasi error Instagram
src/env.ts                      pemuatan .env lokal + validasi env wajib
src/log.ts                      log + ringkasan GITHUB_STEP_SUMMARY
src/render-queue.ts             render lokal untuk posting manual
src/smoke-render.ts             render contoh tanpa credential
src/templates/                  salinan markup, registry, dan caption dari repo situs
assets/templates.css            salinan CSS template (scope .mfsp)
```

## Sinkronisasi dengan repo situs

Empat berkas ini adalah salinan dari repo `umpomenfess`. Kalau tampilan kartu
menfess berubah di sana, salin ulang ke sini — preview dan gambar yang tayang di
Instagram harus identik.

| Repo situs | Repo ini |
|---|---|
| `src/lib/templates.ts` | `src/templates/index.ts` |
| `src/lib/templates/render.ts` | `src/templates/render.ts` |
| `src/lib/captions.ts` | `src/templates/captions.ts` |
| `src/styles/templates.css` | `assets/templates.css` |

Yang **tidak** boleh berubah seenaknya: ukuran `540×675`, safe-zone tengah
`540×540`, nama class `.mfsp`/`.frame`, dan `window.__renderFess` sebagai satu-
satunya jembatan antara `render-entry.ts` dan `render.ts`.

## Kuota Instagram

Content Publishing API dibatasi 50 post/24 jam (jendela bergulir) walaupun
`quota_total` kadang melaporkan 100. Worker memakai `EFFECTIVE_PUBLISH_CEILING =
50` dan berhenti sebelum membuat container yang pasti ditolak — menembak terus
justru sinyal anti-spam ke Instagram. Rinciannya di `src/quota.ts`.

## Keamanan

- Kredensial hanya dibaca dari environment; tidak ada nilai di dalam repo.
- `.env`, `.env.*`, `src/render-bundle.js`, dan `postingan/` di-ignore git.
- Log tidak pernah mencetak token atau isi mentah pesan; URL Cloudinary
  dipotong saat dicatat.
- Workflow memakai `permissions: contents: read` dan hanya membaca
  `${{ secrets.* }}`.

Repo ini publik. Jangan menambahkan URL privat, token, atau data pribadi
pengirim ke kode, komentar, maupun contoh.
