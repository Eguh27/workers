import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvFile, readWorkerEnv } from './env';

/* Pembacaan .env lokal. Yang dijaga: secrets CI tidak boleh bisa ditimpa
   berkas .env (kalau tertimpa, worker bisa memakai kredensial yang salah
   tanpa ada yang menyadarinya), dan nilai berspasi/kutip tetap utuh. */

test('baris KEY=VALUE dijadikan pasangan', () => {
  assert.deepEqual(parseEnvFile('DATABASE_URL=postgres://x\nIG_USER_ID=123'), {
    DATABASE_URL: 'postgres://x',
    IG_USER_ID: '123',
  });
});

test('komentar, baris kosong, dan nama tidak valid dilewati', () => {
  assert.deepEqual(parseEnvFile('# komentar\n\nbukan_env=1\nlower=2\nA_B=3\n  '), { A_B: '3' });
});

test('tanda kutip pembungkus dan spasi tepi dibuang', () => {
  assert.deepEqual(parseEnvFile('A="satu dua"\nB=\'tiga\'\nC= empat '), {
    A: 'satu dua',
    B: 'tiga',
    C: 'empat',
  });
});

test('env wajib yang kosong ditolak dengan nama variabelnya', () => {
  const saved = { ...process.env };
  try {
    delete process.env.DATABASE_URL;
    delete process.env.IG_USER_ID;
    delete process.env.IG_ACCESS_TOKEN;
    process.env.IG_USER_ID = '123';
    assert.throws(() => readWorkerEnv(), /DATABASE_URL/);
    process.env.DATABASE_URL = 'postgres://db';
    delete process.env.IG_USER_ID;
    assert.throws(() => readWorkerEnv(), /IG_USER_ID/);
  } finally {
    process.env = saved;
  }
});

test('env lengkap dipetakan ke bentuk yang dipakai worker', () => {
  const saved = { ...process.env };
  try {
    process.env.DATABASE_URL = 'postgres://db';
    process.env.IG_USER_ID = '42';
    process.env.IG_ACCESS_TOKEN = 'token';
    assert.deepEqual(readWorkerEnv(), {
      databaseUrl: 'postgres://db',
      igUserId: '42',
      igToken: 'token',
    });
  } finally {
    process.env = saved;
  }
});
