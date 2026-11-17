/* =========================================================
   WORKER STATE — baca/tulis tabel `worker_state` (satu row, id='default').

   State global untuk koinotes kuota dan cooldown notifikasi.
========================================================= */
import type { Client } from 'pg';

export interface WorkerStateRow {
  id: string;
  quota_blocked_until: Date | null;
  last_notified_at: Date | null;
  updated_at: Date;
}

/** Baca row state (pastikan row default sudah ada via migration). */
export async function readState(db: Client): Promise<WorkerStateRow> {
  const { rows } = await db.query<WorkerStateRow>(
    `SELECT id, quota_blocked_until, last_notified_at, updated_at
       FROM worker_state WHERE id = 'default'`,
  );
  return rows[0] ?? { id: 'default', quota_blocked_until: null, last_notified_at: null, updated_at: new Date() };
}

/** Simpan estimasi slot bebas berikutnya (atau NULL). */
export async function setQuotaBlockedUntil(db: Client, date: Date | null): Promise<void> {
  await db.query(
    `UPDATE worker_state SET quota_blocked_until = $1, updated_at = now() WHERE id = 'default'`,
    [date],
  );
}

/** Simpan waktu notifikasi terakhir (global). */
export async function setNotifiedAt(db: Client, date: Date | null): Promise<void> {
  await db.query(
    `UPDATE worker_state SET last_notified_at = $1, updated_at = now() WHERE id = 'default'`,
    [date],
  );
}

/** Hitung item `waiting_manual` untuk menentukan apakah perlu notifikasi. */
export async function countWaitingManual(db: Client): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int as n FROM menfess WHERE status = 'waiting_manual'`,
  );
  return rows[0]?.n ?? 0;
}