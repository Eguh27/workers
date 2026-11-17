/* =========================================================
   LOG & RINGKASAN RUN.
   Log panjang masuk stdout (Actions menyimpannya di log job), sedangkan
   ringkasan singkat ditulis ke GITHUB_STEP_SUMMARY supaya hasil satu run
   terbaca tanpa membuka log mentah.
========================================================= */
import { writeFileSync } from 'node:fs';

const summary: string[] = [];

export function log(...args: unknown[]): void {
  console.log('[worker]', ...args);
}

/** Satu baris ringkasan untuk halaman Actions. */
export function summaryLine(line: string): void {
  summary.push(line);
}

export function writeSummary(): void {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path && summary.length > 0) {
    writeFileSync(path, summary.join('\n') + '\n', { flag: 'a' });
  }
}

/** Hentikan run dengan pesan yang jelas; ringkasan tetap ditulis lebih dulu
 *  supaya kegagalan konfigurasi terbaca di halaman Actions. */
export function fatal(message: string): never {
  console.error('[worker] FATAL:', message);
  summary.push(`❌ ${message}`);
  writeSummary();
  process.exit(1);
}
