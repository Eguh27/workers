import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORKFLOW_TIMEOUT_MS } from './run-budget';
import { STALE_PROCESSING_MS, staleClaimStatus } from './stale-claim';

/* Row yang diklaim worker berstatus `processing`. Kalau run-nya mati di tengah
   job (timeout workflow, atau dibatalkan concurrency), row itu tidak pernah
   kembali ke `queued` dan tidak pernah diambil lagi — hilang diam-diam.

   Ambang sapuan harus lebih panjang dari umur maksimum satu run, kalau tidak
   sapuan akan mencuri row dari run yang masih hidup. */

test('ambang sapuan lebih panjang dari umur maksimum satu run', () => {
  assert.ok(
    STALE_PROCESSING_MS > WORKFLOW_TIMEOUT_MS,
    `ambang ${STALE_PROCESSING_MS}ms harus > ${WORKFLOW_TIMEOUT_MS}ms`,
  );
});

test('ambang sapuan tidak lebih dari satu jam', () => {
  // terlalu panjang = row nyangkut memblokir antrean berjam-jam
  assert.ok(STALE_PROCESSING_MS <= 60 * 60_000, `ambang ${STALE_PROCESSING_MS}ms terlalu panjang`);
});

test('row yang ditinggalkan run mati dikembalikan ke antrean', () => {
  assert.equal(staleClaimStatus(0, 3), 'queued');
  assert.equal(staleClaimStatus(1, 3), 'queued');
});

test('row yang sudah kehabisan attempt jadi failed, bukan memblokir antrean', () => {
  // kalau tidak, satu row bermasalah membuat tiap run mati di row yang sama
  // dan seluruh antrean di belakangnya tidak pernah tersentuh
  assert.equal(staleClaimStatus(2, 3), 'failed');
  assert.equal(staleClaimStatus(5, 3), 'failed');
});
