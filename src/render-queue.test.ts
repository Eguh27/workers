import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from './render-queue';
import { MAX_DECORS } from './templates';

/* Rencana render untuk posting manual.
   Yang dijaga di sini: URUTAN. Pemilik meminta antrean dirender urut
   `created_at`, dan nomor berkas harus mengikuti urutan itu — kalau tidak,
   dia memposting dengan urutan yang salah tanpa menyadarinya. */

const row = (code: string, content: string, extra: Partial<Parameters<typeof buildPlan>[0][number]> = {}) => ({
  submission_code: code,
  content,
  template: 'langit',
  bg_preset: null,
  custom_config: null,
  ...extra,
});

test('urutan masukan dipertahankan dan dinomori dari 1', () => {
  const plan = buildPlan([row('AAAA-1111', 'satu'), row('BBBB-2222', 'dua'), row('CCCC-3333', 'tiga')]);
  assert.deepEqual(plan.map((p) => p.no), [1, 2, 3]);
  assert.deepEqual(plan.map((p) => p.code), ['AAAA-1111', 'BBBB-2222', 'CCCC-3333']);
});

test('nomor dipad dua digit dan jadi nama berkas', () => {
  const plan = buildPlan([row('NW6K-9C7R', 'a'), row('NVK8-AMFM', 'b')]);
  assert.equal(plan[0].file, '01-NW6K-9C7R.jpg');
  assert.equal(plan[1].file, '02-NVK8-AMFM.jpg');
});

test('row ke-100 tidak terpotong nomornya', () => {
  const rows = Array.from({ length: 101 }, (_, i) => row(`C${i}-X`, 'isi'));
  const plan = buildPlan(rows);
  assert.equal(plan[99].file, '100-C99-X.jpg');
  assert.equal(plan[100].file, '101-C100-X.jpg');
});

test('caption memakai isi mentah, bukan teks yang sudah dihias header', () => {
  const plan = buildPlan([row('AAAA-1111', 'isi pesan', { custom_config: { from: 'mahasiswa' } })]);
  assert.ok(plan[0].caption.includes('isi pesan'));
  assert.ok(plan[0].caption.includes('#umpomenfess'));
  assert.ok(!plan[0].caption.includes('from:'), 'caption tidak boleh memuat header from/to');
});

test('gambar dirender dengan header from/to dari custom_config', () => {
  const plan = buildPlan([row('AAAA-1111', 'isi pesan', { custom_config: { from: 'mahasiswa', to: 'kamu' } })]);
  assert.equal(plan[0].state.content, 'from: mahasiswa\nto: kamu\n\nisi pesan');
});

test('printilan dibatasi MAX_DECORS walau database menyimpan lebih', () => {
  const banyak = Array.from({ length: 9 }, (_, i) => `d${i}`);
  const plan = buildPlan([row('AAAA-1111', 'isi', { custom_config: { decors: banyak } })]);
  assert.equal(plan[0].state.decors.length, MAX_DECORS);
});

test('bg_preset null tetap diteruskan sebagai null', () => {
  const plan = buildPlan([row('AAAA-1111', 'isi')]);
  assert.equal(plan[0].state.bg, null);
});
