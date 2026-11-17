/* =========================================================
   ENVIRONMENT WORKER — pemuatan .env lokal dan validasi env wajib.
   Di GitHub Actions semua nilai datang dari secrets, jadi .env tidak
   ada; di laptop .env dipakai supaya tidak perlu `export` manual.
   Secrets CI selalu menang: nilai yang sudah ada tidak pernah ditimpa.

   Dua jalur punya env wajib berbeda: render butuh Cloudinary, publish butuh
   Instagram. Memisahkannya membuat Cron Render bisa berhenti cepat kalau
   kredensial IG tidak ada (dan sebaliknya), bukan setengah jalan.
========================================================= */
import { readFileSync } from 'node:fs';

/** Env khusus Cron Render: database + Cloudinary. Tanpa kredensial IG. */
export type RenderEnv = {
  databaseUrl: string;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
};

/** Env khusus worker publish: database + Instagram. Tanpa Cloudinary. */
export type PublishEnv = {
  databaseUrl: string;
  igUserId: string;
  igToken: string;
};

const REQUIRED_RENDER = [
  'DATABASE_URL',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;

const REQUIRED_PUBLISH = ['DATABASE_URL', 'IG_USER_ID', 'IG_ACCESS_TOKEN'] as const;

/** Baris `KEY=VALUE` dari isi berkas .env.
 *  Komentar, baris kosong, dan nama yang bukan HURUF_BESAR dilewati — pola
 *  sederhana ini cukup untuk .env yang kita tulis sendiri, tanpa dependency. */
export function parseEnvFile(text: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) parsed[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return parsed;
}

/** Terapkan isi berkas .env ke process.env tanpa menimpa yang sudah ada.
 *  Berkas tidak ada → dilewati (kondisi normal di CI). */
export function loadLocalEnv(path: URL): void {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const [key, value] of Object.entries(parseEnvFile(text))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Baca nama env yang wajib ada. Gagal cepat dengan nama variabel yang kurang —
 *  worker tidak boleh menyentuh database dengan konfigurasi setengah jadi. */
function requireEnv(names: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of names) {
    const value = process.env[name];
    if (!value) throw new Error(`Environment ${name} belum diset`);
    values[name] = value;
  }
  return values;
}

/** Env Cron Render. Cloudinary wajib karena upload hanya terjadi di sini. */
export function readRenderEnv(): RenderEnv {
  const env = requireEnv(REQUIRED_RENDER);
  return {
    databaseUrl: env.DATABASE_URL,
    cloudinaryCloudName: env.CLOUDINARY_CLOUD_NAME,
    cloudinaryApiKey: env.CLOUDINARY_API_KEY,
    cloudinaryApiSecret: env.CLOUDINARY_API_SECRET,
  };
}

/** Env worker publish. */
export function readPublishEnv(): PublishEnv {
  const env = requireEnv(REQUIRED_PUBLISH);
  return {
    databaseUrl: env.DATABASE_URL,
    igUserId: env.IG_USER_ID,
    igToken: env.IG_ACCESS_TOKEN,
  };
}

/** @deprecated Nama lama sebelum env dipisah render/publish. Dipertahankan
 *  hanya karena `src/env.test.ts` masih mengimpornya; WP3/WP7 boleh menghapus
 *  setelah tes memakai `readPublishEnv`. */
export function readWorkerEnv(): PublishEnv {
  return readPublishEnv();
}
