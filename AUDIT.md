# AUDIT — ekstraksi worker umpomenfess

Hasil audit Tahap 1 sebelum ada perubahan apa pun. Sumber: repo situs
`umpomenfess` (private), commit `60e9f35`.

## 1. File milik worker

Baris dihitung dari kondisi repo saat audit.

| File sumber | Baris | Peran |
|---|---:|---|
| `worker/publish.ts` | 361 | entrypoint worker: claim, orkestrasi, publish IG, summary Actions |
| `worker/render.ts` | 147 | Chrome headless (puppeteer-core) + upload Cloudinary |
| `worker/render-entry.ts` | 19 | entry bundle browser: suntik CSS + daftarkan `window.__renderFess` |
| `worker/render-env.d.ts` | 15 | tipe `*.css` dan `window.__renderFess` |
| `worker/build-render-bundle.mjs` | 16 | esbuild IIFE `render-entry.ts` → `render-bundle.js` |
| `worker/quota.ts` | 58 | plafon 50/24 jam, parse `content_publishing_limit`, slot bebas |
| `worker/quota.test.ts` | 63 | tes |
| `worker/run-budget.ts` | 41 | `MAX_JOBS_PER_RUN`, jeda antar post, anggaran timeout |
| `worker/run-budget.test.ts` | 39 | tes |
| `worker/stale-claim.ts` | 25 | ambang & nasib row `processing` yang ditinggal run mati |
| `worker/stale-claim.test.ts` | 35 | tes |
| `worker/transient-error.ts` | 23 | klasifikasi error IG (transient vs permanen vs kuota) |
| `worker/transient-error.test.ts` | 65 | tes |
| `worker/render-queue.ts` | 151 | render antrean ke berkas lokal untuk posting manual |
| `worker/render-queue.test.ts` | 60 | tes |
| `.github/workflows/publish.yml` | 57 | workflow: dispatch + cron 5 menit + manual |

Artefak build `worker/render-bundle.js` tidak masuk git (lihat `.gitignore`
project utama) — dibuat oleh `npm run render:bundle`.

Dependensi npm yang benar-benar dipakai worker:
`pg`, `puppeteer-core`, `cloudinary` (runtime) serta `esbuild`, `tsx`,
`typescript`, `@types/node`, `@types/pg` (build/tes). Sisa dependensi project
utama (`astro`, `@astrojs/vercel`, `@supabase/supabase-js`) tidak dipakai
worker.

## 2. Dependensi silang ke project utama

Worker meng-import empat file milik situs. Tidak satu pun khusus worker, jadi
salinan harus dibuat; file aslinya tetap dipakai preview composer.

| File sumber | Yang dipakai worker | Pemakai lain di project utama |
|---|---|---|
| `src/lib/templates.ts` | `composeFess`, `MAX_DECORS`, tipe `TemplateId`/`DecorId`, `bgPresetFor` (via `render.ts`) | composer, `POST /api/fess` (validasi) |
| `src/lib/templates/render.ts` | `buildNode`, tipe `RenderState` | `src/components/Composer.astro` (preview DOM) |
| `src/lib/captions.ts` | `captionFor` | `src/components/Composer.astro` (preview caption) |
| `src/styles/templates.css` | seluruh teks CSS, di-bundle dengan loader `text` | `src/components/Composer.astro` (preview) |

Konsekuensi yang harus diterima: markup/CSS template kini ada **dua salinan**
(project utama untuk preview, repo worker untuk render). Keduanya harus identik
— lihat bagian "Sinkronisasi" di `README.md`.

Selain itu `publish.ts` membaca `../.env` relatif terhadap file-nya. Di repo
baru path itu menjadi `.env` di root repo.

## 3. Environment dan secrets

| Variabel | Wajib | Dipakai | Sumber produksi |
|---|---|---|---|
| `DATABASE_URL` | ya | `publish.ts`, `render-queue.ts` | Actions secret |
| `IG_USER_ID` | ya | `publish.ts` | Actions secret |
| `IG_ACCESS_TOKEN` | ya | `publish.ts` | Actions secret |
| `CLOUDINARY_CLOUD_NAME` | ya | `render.ts` | Actions secret |
| `CLOUDINARY_API_KEY` | ya | `render.ts` | Actions secret |
| `CLOUDINARY_API_SECRET` | ya | `render.ts` | Actions secret |
| `CHROME_PATH` | tidak | `render.ts` | env lokal; runner sudah punya Chrome |
| `GITHUB_STEP_SUMMARY` | tidak | `publish.ts` | diisi otomatis GitHub Actions |

Tidak ada variabel khusus Vercel (`GH_PAT`, `GH_REPO`, `IP_HASH_SALT`,
`PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`) yang dibaca worker. Arahnya
kebalik: API di Vercel memicu workflow ini memakai `GH_PAT` + `GH_REPO`.

## 4. Perilaku runtime yang harus dipertahankan

1. Render `540×675` dengan `deviceScaleFactor: 2` → JPEG `1080×1350`.
2. Klaim atomik `FOR UPDATE SKIP LOCKED`, status `queued → processing →
   published|failed`, maksimal 3 attempt.
3. Kuota publish IG dicek sebelum klaim dan sebelum tiap post; habis →
   run berhenti tanpa membakar attempt.
4. Sapuan row `processing` lebih tua dari 15 menit (timeout run + kelonggaran).
5. Instagram Login Graph API di `https://graph.instagram.com/v21.0`.
6. Upload Cloudinary hanya di worker; API tidak pernah menyentuh gambar.
7. Worker menulis ringkasan run ke `GITHUB_STEP_SUMMARY` bila tersedia.
