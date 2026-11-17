import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePublishingLimit, nextFreeSlot, EFFECTIVE_PUBLISH_CEILING } from './quota';

/* Balasan ASLI dari akun umpomenfess (16 Nov 2026). quota_total melaporkan 100,
   tetapi media_publish ditolak pada post ke-51. Plafon efektif harus 50. */
const REAL_RESPONSE = {
  data: [{ quota_usage: 50, config: { quota_total: 100, quota_duration: 86400 } }],
};

test('quota_total 100 dipangkas ke plafon efektif 50', () => {
  const q = parsePublishingLimit(REAL_RESPONSE);
  assert.ok(q);
  assert.equal(q.usage, 50);
  assert.equal(q.total, EFFECTIVE_PUBLISH_CEILING);
  assert.equal(q.remaining, 0, 'usage 50 dari plafon efektif 50 → sisa 0');
});

test('sisa kuota dihitung dari plafon efektif, bukan quota_total', () => {
  const q = parsePublishingLimit({ data: [{ quota_usage: 10, config: { quota_total: 100 } }] });
  assert.ok(q);
  assert.equal(q.remaining, 40);
});

test('plafon yang lebih rendah dari 50 dihormati', () => {
  const q = parsePublishingLimit({ data: [{ quota_usage: 20, config: { quota_total: 25 } }] });
  assert.ok(q);
  assert.equal(q.total, 25);
  assert.equal(q.remaining, 5);
});

test('sisa tidak pernah negatif', () => {
  const q = parsePublishingLimit({ data: [{ quota_usage: 60, config: { quota_total: 100 } }] });
  assert.ok(q);
  assert.equal(q.remaining, 0);
});

test('bentuk balasan yang tidak dikenal → null (fail-open)', () => {
  assert.equal(parsePublishingLimit({ data: [] }), null);
  assert.equal(parsePublishingLimit({}), null);
  assert.equal(parsePublishingLimit(null), null);
  assert.equal(parsePublishingLimit({ data: [{ config: {} }] }), null);
  assert.equal(parsePublishingLimit({ data: 'bukan array' }), null);
});

test('kuota pulih mengikuti jendela rolling 24 jam', () => {
  const base = Date.UTC(2026, 10, 16, 6, 0, 0);
  const times = Array.from({ length: 50 }, (_, i) => new Date(base + i * 6 * 60_000));
  // slot pertama bebas saat publish tertua keluar dari jendela 24 jam
  assert.equal(nextFreeSlot(times, 50)?.toISOString(), new Date(base + 86_400_000).toISOString());
});

test('publish ke-51 menggeser slot bebas ke publish ke-2', () => {
  const base = Date.UTC(2026, 10, 16, 6, 0, 0);
  const times = Array.from({ length: 51 }, (_, i) => new Date(base + i * 6 * 60_000));
  assert.equal(nextFreeSlot(times, 50)?.toISOString(), new Date(base + 6 * 60_000 + 86_400_000).toISOString());
});

test('belum mencapai plafon → tidak ada waktu tunggu', () => {
  const times = Array.from({ length: 10 }, (_, i) => new Date(Date.UTC(2026, 10, 16, 6, i)));
  assert.equal(nextFreeSlot(times, 50), null);
  assert.equal(nextFreeSlot([], 50), null);
});
