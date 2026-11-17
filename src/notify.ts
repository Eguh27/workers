/* =========================================================
   NOTIFIKASI WAITING ROOM — token HMAC + webhook (no-op tanpa URL).

   Token format: "<exp_unix>.<base64url(HMAC_SHA256(secret, "waiting-room:" + exp))>"
   Sama persis dengan kontrak ORCHESTRATION.md §2.3 dan WP4.
========================================================= */
import { createHmac } from 'node:crypto';
import { LIMITS } from './config';
import { log } from './log';

const TOKEN_PREFIX = 'waiting-room:';

/** Hasilkan token magic link (expired Unix detik). */
export function signWaitroomToken(secret: string, expUnix: number): string {
  const hmac = createHmac('sha256', secret).update(`${TOKEN_PREFIX}${expUnix}`).digest();
  const sig = Buffer.from(hmac).toString('base64url');
  return `${expUnix}.${sig}`;
}

/** Verifikasi token magic link (perbandingan waktu-konstan).
 *  Mengembalikan `expUnix` jika valid, `null` jika tidak. */
export function verifyWaitroomToken(secret: string, token: string): number | null {
  const idx = token.indexOf('.');
  if (idx <= 0) return null;
  const expStr = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const exp = Number.parseInt(expStr, 10);
  if (!Number.isFinite(exp)) return null;
  if (exp < Math.floor(Date.now() / 1000)) return null; // kedaluwarsa
  const expected = signWaitroomToken(secret, exp);
  // perbandingan waktu-konstan: panjang harus sama
  if (expected.length !== token.length) return null;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? exp : null;
}

/** Kirim notifikasi ke webhook (Discord-compatible `{ content }`).
 *
 *  No-op bila `WAITROOM_WEBHOOK_URL` kosong. Error ditelan + log,
 *  token tidak dicatat. */
export async function notifyWaitingRoom(params: {
  webhookUrl: string;
  baseUrl: string;
  secret: string;
  count: number;
  nextFree: Date | null;
  ttlHours: number;
}): Promise<void> {
  const { webhookUrl, baseUrl, secret, count, nextFree, ttlHours } = params;
  if (!webhookUrl) return;

  const expUnix = Math.floor(Date.now() / 1000) + ttlHours * 3600;
  const token = signWaitroomToken(secret, expUnix);
  const link = `${baseUrl.replace(/\/$/, '')}/waiting-room?token=${token}`;

  const when = nextFree
    ? `Perkiraan slot API bebas: <t:${Math.floor(nextFree.getTime() / 1000)}:R> (${nextFree.toISOString()}).`
    : 'Slot API akan bebas saat jendela 24 jam bergulir.';

  const content = [
    `📬 **Waiting Room aktif** — ${count} menfess menunggu posting manual.`,
    when,
    `TTL antrean: ${ttlHours} jam. Item melewati TTL/overflow otomatis masuk sini.`,
    `Buka CMS: ${link}`,
    `(Token berlaku ${ttlHours} jam. Jika link kedaluwarsa, buka halaman Waiting Room langsung.)`,
  ].join('\n');

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) log('webhook notifikasi gagal:', res.status, await res.text());
    else log('notifikasi Waiting Room terkirim');
  } catch (err) {
    log('webhook notifikasi error (ditelan):', String(err));
  }
}