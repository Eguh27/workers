import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSlideStates, slideCountOf, slideUrlsOf } from './slide-plan';
import { MAX_DECORS } from './templates';

const base = {
  submission_code: 'AB2D-CD34',
  content: 'halo semua',
  template: 'langit',
  bg_preset: null as string | null,
  custom_config: null as Record<string, unknown> | null,
};

test('row tanpa slides → satu state (alur lama)', () => {
  const states = buildSlideStates(base);
  assert.equal(states.length, 1);
  assert.equal(states[0].slide, undefined);
  assert.equal(slideCountOf(base), 1);
});

test('row dengan slides → satu state per slide, penanda index/total', () => {
  const row = {
    ...base,
    custom_config: { slides: ['satu', 'dua', 'tiga'], slide_count: 3 },
  };
  const states = buildSlideStates(row);
  assert.equal(states.length, 3);
  assert.deepEqual(states.map((s) => s.slide), [
    { index: 1, total: 3 }, { index: 2, total: 3 }, { index: 3, total: 3 },
  ]);
});

test('from/to ikut terpasang di setiap slide', () => {
  const row = {
    ...base,
    custom_config: { slides: ['satu', 'dua'], slide_count: 2, from: 'teman', to: 'kamu' },
  };
  const states = buildSlideStates(row);
  assert.ok(states[0].content.startsWith('from: teman'));
  assert.ok(states[1].content.includes('to: kamu'));
});

test('slide_count tidak dipercaya bila slides tidak sinkron', () => {
  const row = {
    ...base,
    custom_config: { slides: ['satu', 'dua'], slide_count: 5 },
  };
  assert.equal(slideCountOf(row), 2, 'jumlah nyata dari panjang array');
});

test('row warisan dengan slide_count tapi tanpa slides → satu slide', () => {
  const row = { ...base, custom_config: { slide_count: 3 } };
  assert.equal(slideCountOf(row), 1);
  assert.equal(buildSlideStates(row).length, 1);
});

test('decors dibatasi MAX_DECORS dan ikut terpasang', () => {
  const decors = Array.from({ length: MAX_DECORS + 3 }, (_, i) => `d${i}`);
  const row = { ...base, custom_config: { decors } };
  assert.equal(buildSlideStates(row)[0].decors.length, MAX_DECORS);
});

test('slide kosong di tengah array dibuang — tidak pernah jadi gambar kosong', () => {
  const row = { ...base, custom_config: { slides: ['satu', '   ', 'dua', ''], slide_count: 4 } };
  const states = buildSlideStates(row);
  assert.equal(states.length, 2);
  assert.deepEqual(states.map((s) => s.slide), [{ index: 1, total: 2 }, { index: 2, total: 2 }]);
});

test('array yang isinya hanya kosong jatuh ke alur satu slide (content)', () => {
  const row = { ...base, content: 'isi asli', custom_config: { slides: ['  ', ''], slide_count: 2 } };
  const states = buildSlideStates(row);
  assert.equal(states.length, 1);
  assert.equal(states[0].slide, undefined);
  assert.ok(states[0].content.includes('isi asli'));
});

test('slideUrlsOf: pakai image_urls bila ada, jatuh ke image_url, error bila dua-duanya kosong', () => {
  assert.deepEqual(slideUrlsOf({ image_url: 'u1', custom_config: { image_urls: ['a', 'b'] } }), ['a', 'b']);
  assert.deepEqual(slideUrlsOf({ image_url: 'u1', custom_config: null }), ['u1']);
  assert.throws(() => slideUrlsOf({ image_url: null, custom_config: { image_urls: [] } }), /belum dirender/);
});
