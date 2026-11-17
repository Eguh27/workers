# umpomenfess-worker — konteks untuk agent

## Apa repo ini

Worker render & publish menfess anonim `@umpomenfess` (Universitas
Muhammadiyah Ponorogo). Repo ini **publik** dan berdiri sendiri: tidak
meng-import apa pun dari repo situs, tidak punya dependensi antar-repo.

Sumber kebenaran perilaku: `README.md` (cara kerja + secrets) dan kode di
`src/`. `AUDIT.md` merekam kondisi saat worker dipisahkan dari repo utama —
berguna untuk membandingkan perilaku, bukan untuk dijadikan spesifikasi baru.

## Batasan yang tidak boleh dilanggar

- **Jangan tambah trigger `pull_request` atau `pull_request_target`.** Workflow
  memegang kredensial produksi dan repo ini publik. Hanya
  `repository_dispatch`, `workflow_dispatch`, dan `schedule`.
- **Jangan menambahkan secret atau URL privat** ke kode, komentar, contoh, atau
  dokumentasi. Repo publik.
- **Jangan menaikkan plafon publish Instagram** di `src/quota.ts`. Angka 50
  adalah plafon efektif yang benar-benar ditegakkan Meta, bukan selera.
- **Jangan mengubah `540×675` / `1080×1350`, safe-zone `540×540`, atau nama
  class `.mfsp`/`.frame`.** Grid Instagram memotong menjadi persegi di tengah.
- **Jangan mengubah status row di `render-queue.ts`.** Row harus tetap `queued`
  sampai pemilik mengonfirmasi posting manual, kalau tidak terjadi posting dobel.
- **Jangan mencetak token, isi pesan mentah, atau URL Cloudinary utuh** ke log
  atau `GITHUB_STEP_SUMMARY`.
- Jangan menambah service baru (Redis, VPS, Docker, broker) tanpa persetujuan.

## Invariant runtime

1. `timeout-minutes: 10` di workflow **sama dengan** `WORKFLOW_TIMEOUT_MS` di
   `src/run-budget.ts`; `STALE_PROCESSING_MS` dihitung dari angka itu.
2. `MAX_JOBS_PER_RUN` harus muat di timeout — dijaga `fitsWorkflowTimeout()`
   dan tesnya.
3. Klaim atomik wajib `FOR UPDATE SKIP LOCKED`; concurrency workflow hanya
   pengaman tambahan.
4. Container Instagram dibuat baru tiap attempt (hanya valid 24 jam), tidak
   pernah di-reuse.
5. Error transient tidak boleh membakar attempt.
6. Markup dan CSS berasal dari `buildNode` + `assets/templates.css` yang sama
   dengan preview situs.

## Salinan dari repo situs

`src/templates/index.ts`, `src/templates/render.ts`, `src/templates/captions.ts`,
dan `assets/templates.css` adalah salinan dari repo `umpomenfess`. Perubahan
tampilan kartu harus dilakukan di repo situs lebih dulu, lalu disalin ke sini
(peta file ada di `README.md`). Jangan memperbaiki tampilan hanya di repo ini:
preview dan gambar jadi berbeda.

## Perintah

```bash
npm ci
npm test              # 35 tes, tanpa credential
npm run typecheck
npm run render:bundle
npm run smoke         # render 3 template ke postingan/, tanpa credential
npm run worker        # butuh DATABASE_URL, IG_*, CLOUDINARY_*, Chrome
npm run render:queue  # render antrean untuk posting manual
```

`npm run smoke` adalah verifikasi termurah setelah mengubah render, template,
atau bundle. Hasilnya harus 1080×1350 dan berisi teks + emoji + printilan.

## Gaya kode

- TypeScript ESM, dijalankan `tsx`; tanpa build step selain bundle render.
- Modul kecil dengan satu tanggung jawab: SQL antrean di `queue.ts`, HTTP
  Instagram di `instagram.ts`, Chrome/Cloudinary di `render.ts`, orkestrasi di
  `publish.ts`.
- Komentar menjelaskan **kenapa** (angka, ambang, jebakan Instagram), bukan apa
  yang sudah terbaca dari kode. Bahasa komentar: Indonesia.
- Logika murni yang menyimpan keputusan (kuota, anggaran run, sapuan, klasifikasi
  error) wajib punya tes di sebelahnya.
