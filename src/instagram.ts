/* =========================================================
   KLIEN INSTAGRAM — Instagram Login Graph API (graph.instagram.com).
   Hanya worker yang memegang token; API web di Vercel tidak pernah
   memanggil Instagram dan tidak pernah menerima token ini.
========================================================= */
import { log } from './log';
import { parsePublishingLimit } from './quota';
import { createCarouselContainer } from './carousel';

/** Instagram Login, bukan Facebook Login: graph.facebook.com tidak dipakai. */
const GRAPH_BASE = 'https://graph.instagram.com/v21.0';

/** Container IG kadang belum siap beberapa detik setelah dibuat. */
const PUBLISH_POLL_MAX = 6;
const PUBLISH_POLL_DELAY_MS = 10_000;

/** IG men-download image_url saat membuat container; verifikasi bytes + MIME
 *  lebih dulu supaya kegagalan CDN tidak muncul sebagai error yang samar. */
const IMAGE_READY_TIMEOUT_MS = 20_000;
const IMAGE_READY_POLL_MS = 2_000;

export interface InstagramClient {
  /** Container baru tiap attempt — container IG hanya valid 24 jam. */
  createContainer(imageUrl: string, caption: string): Promise<string>;
  /** Carousel: satu child per gambar lalu satu parent `media_type=CAROUSEL`.
   *  Instagram yang menyusun slide-nya; satu fess tetap satu post.
   *  Mengembalikan id parent untuk di-publish pemanggil (JANGAN publish di sini). */
  createCarouselContainer(imageUrls: string[], caption: string): Promise<string>;
  publishContainer(creationId: string): Promise<string>;
  /** Sisa post yang boleh terbit sekarang; null = tidak terbaca (fail-open). */
  remainingPosts(): Promise<number | null>;
  /** Permalink post; jatuh ke bentuk `/p/<id>` bila API tidak memberikannya. */
  permalink(mediaId: string): Promise<string>;
  waitUntilImagePublic(url: string): Promise<void>;
}

export function createInstagramClient(token: string, userId: string): InstagramClient {
  async function get(id: string, fields: string): Promise<Record<string, unknown>> {
    const url = `${GRAPH_BASE}/${id}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error(JSON.stringify(json.error ?? json));
    return json;
  }

  async function post(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await fetch(`${GRAPH_BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, access_token: token }),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error(JSON.stringify(json.error ?? json));
    return json;
  }

  async function publishContainer(creationId: string): Promise<string> {
    let lastError: unknown;
    for (let i = 0; i < PUBLISH_POLL_MAX; i++) {
      try {
        const res = await post(`${userId}/media_publish`, { creation_id: creationId });
        return res.id as string;
      } catch (err) {
        lastError = err;
        const message = String(err);
        if (!/media id|not.*(ready|finish|process)|2207046/i.test(message)) throw err;
        log(`container belum siap (percobaan ${i + 1}/${PUBLISH_POLL_MAX}), tunggu ${PUBLISH_POLL_DELAY_MS / 1000}s…`);
        await sleep(PUBLISH_POLL_DELAY_MS);
      }
    }
    throw lastError;
  }

  async function remainingPosts(): Promise<number | null> {
    try {
      // quota_total/quota_remaining sudah tidak ada; API hanya mengenal
      // quota_usage + config{quota_total,quota_duration}.
      const res = await get(`${userId}/content_publishing_limit`, 'quota_usage,config');
      return parsePublishingLimit(res)?.remaining ?? null;
    } catch (err) {
      log('gagal cek kuota (lanjut saja):', String(err));
      return null;
    }
  }

  async function permalink(mediaId: string): Promise<string> {
    try {
      const meta = await get(mediaId, 'permalink');
      if (typeof meta.permalink === 'string') return meta.permalink;
    } catch (err) {
      log('permalink fetch gagal (pakai fallback):', String(err));
    }
    return `https://www.instagram.com/p/${mediaId}`;
  }

  async function waitUntilImagePublic(url: string): Promise<void> {
    const start = Date.now();
    await sleep(IMAGE_READY_POLL_MS);
    while (Date.now() - start < IMAGE_READY_TIMEOUT_MS) {
      try {
        const res = await fetch(url, { headers: { Range: 'bytes=0-0' } });
        const mime = res.headers.get('content-type')?.toLowerCase() ?? '';
        await res.body?.cancel();
        if (res.ok && mime.startsWith('image/')) {
          log(`image URL siap (${mime}) ✓`);
          return;
        }
        log(`GET ${url.slice(0, 60)}… → ${res.status} (${mime || 'tanpa MIME'})`);
      } catch { /* CDN belum siap — coba lagi */ }
      await sleep(IMAGE_READY_POLL_MS);
    }
    throw new Error(`image URL belum dapat diakses setelah ${IMAGE_READY_TIMEOUT_MS}ms`);
  }

  return {
    createContainer: async (imageUrl, caption) => {
      const res = await post(`${userId}/media`, { image_url: imageUrl, caption });
      return res.id as string;
    },
    createCarouselContainer: (imageUrls, caption) =>
      createCarouselContainer(imageUrls, caption, {
        post: (path, params) => post(`${userId}/${path}`, params),
      }),
    publishContainer,
    remainingPosts,
    permalink,
    waitUntilImagePublic,
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
