import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_JOBS_PER_RUN,
  BETWEEN_POSTS_DELAY_MS,
  PER_JOB_BUDGET_MS,
  WORKFLOW_TIMEOUT_MS,
  estimatedRunDurationMs,
  fitsWorkflowTimeout,
} from './run-budget';

/* Anggaran satu run worker. Nilainya bukan selera: job GitHub Actions di
   .github/workflows/publish.yml punya timeout-minutes: 10, dan kalau satu run
   melewatinya, run itu dibunuh di tengah jalan — job yang sudah diklaim tetap
   berstatus `processing` sampai cron berikutnya menyapunya. */

test('satu run memuat 5 job', () => {
  assert.equal(MAX_JOBS_PER_RUN, 5);
});

test('5 job + jeda antar post masih di bawah timeout workflow', () => {
  assert.equal(fitsWorkflowTimeout(), true);
  assert.ok(
    estimatedRunDurationMs() < WORKFLOW_TIMEOUT_MS,
    `${estimatedRunDurationMs()}ms harus < ${WORKFLOW_TIMEOUT_MS}ms`,
  );
});

test('perkiraan durasi = n job + (n-1) jeda antar post', () => {
  // post terakhir tidak diikuti jeda
  assert.equal(estimatedRunDurationMs(1), PER_JOB_BUDGET_MS);
  assert.equal(estimatedRunDurationMs(3), 3 * PER_JOB_BUDGET_MS + 2 * BETWEEN_POSTS_DELAY_MS);
  assert.equal(estimatedRunDurationMs(5), 5 * PER_JOB_BUDGET_MS + 4 * BETWEEN_POSTS_DELAY_MS);
});

test('jumlah job yang membahayakan timeout ditolak', () => {
  // pengaman kalau nanti ada yang menaikkan angkanya tanpa menghitung
  assert.equal(fitsWorkflowTimeout(20), false);
});
