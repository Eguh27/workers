/* =========================================================
   SMOKE RENDER — bukti cepat bahwa pipeline render masih utuh,
   tanpa database, Cloudinary, atau kredensial Instagram.
   Dipakai untuk verifikasi lokal dan kontribusi di repo publik.

   Keluaran: postingan/smoke-<template>.jpg (di-ignore git), ukuran
   harus 1080×1350 piksel (540×675 dengan deviceScaleFactor 2).
========================================================= */
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderToBuffer, shutdownRenderer } from './render';
import { composeFess, TEMPLATES } from './templates';
import type { RenderState } from './templates/render';

const OUT_DIR = new URL('../postingan/', import.meta.url);

const SAMPLE_CONTENT = composeFess(
  'Menfess contoh untuk smoke render. Kalau kamu bisa membaca ini di gambar hasil render, '
  + 'font, line-clamp, dan emoji 🎈 sudah ikut ter-render dengan benar.',
  'mahasiswa',
  'kamu',
);

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  for (const { id } of TEMPLATES) {
    const state: RenderState = {
      template: id,
      content: SAMPLE_CONTENT,
      code: 'SMOK-1234',
      decors: ['percik', 'love'],
      bg: null,
    };
    const file = `smoke-${id}.jpg`;
    const buffer = await renderToBuffer(state);
    writeFileSync(new URL(file, OUT_DIR), buffer);
    console.log(`[smoke] ${file} — ${(buffer.length / 1024).toFixed(0)} KB`);
  }

  console.log('[smoke] selesai — periksa postingan/ sebelum menjalankan worker sungguhan.');
}

main()
  .catch((err) => {
    console.error('[smoke] FATAL:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => shutdownRenderer());
