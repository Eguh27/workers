/* =========================================================
   ENVIRONMENT WORKER — pemuatan .env lokal dan validasi env wajib.
   Di GitHub Actions semua nilai datang dari secrets, jadi .env tidak
   ada; di laptop .env dipakai supaya tidak perlu `export` manual.
   Secrets CI selalu menang: nilai yang sudah ada tidak pernah ditimpa.
========================================================= */
import { readFileSync } from 'node:fs';

/** Satu nama env yang tidak boleh kosong, beserta nama field-nya. */
export type WorkerEnv = {
  databaseUrl: string;
  igUserId: string;
  igToken: string;
};

const REQUIRED: Array<{ field: keyof WorkerEnv; name: string }> = [
  { field: 'databaseUrl', name: 'DATABASE_URL' },
  { field: 'igUserId', name: 'IG_USER_ID' },
  { field: 'igToken', name: 'IG_ACCESS_TOKEN' },
];

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

/** Baca env wajib worker. Gagal cepat dengan nama variabel yang kurang —
 *  worker tidak boleh menyentuh database dengan konfigurasi setengah jadi. */
export function readWorkerEnv(): WorkerEnv {
  const env = {} as WorkerEnv;
  for (const { field, name } of REQUIRED) {
    const value = process.env[name];
    if (!value) throw new Error(`Environment ${name} belum diset`);
    env[field] = value;
  }
  return env;
}
