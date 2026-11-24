/* =========================================================
   RENCANA SLIDE — row menfess → daftar state render.
   Murni: tidak menyentuh DB, IG, atau Cloudinary, sehingga bisa
   dites tanpa kredensial. Dipakai worker render & publish.
======================================================== */
import { composeFess, MAX_DECORS } from './templates';
import type { RenderState } from './templates/render';

export interface SlideRow {
  submission_code: string;
  content: string;
  template: string;
  bg_preset: string | null;
  custom_config: Record<string, unknown> | null;
}

function slidesOf(row: SlideRow): string[] | null {
  const raw = row.custom_config?.slides;
  if (!Array.isArray(raw)) return null;
  const slides = raw.filter((s): s is string => typeof s === 'string' && s.trim() !== '');
  return slides.length > 1 ? slides : null;
}

/** jumlah slide nyata — dari panjang array, bukan dari slide_count tersimpan */
export function slideCountOf(row: SlideRow): number {
  return slidesOf(row)?.length ?? 1;
}

/** URL semua slide untuk publish: pakai `custom_config.image_urls` bila ada,
 *  selain itu `image_url` tunggal. Slide yang hilang = error jelas, bukan
 *  carousel setengah jadi yang baru terlihat setelah publish. */
export function slideUrlsOf(row: { image_url: string | null; custom_config: Record<string, unknown> | null }): string[] {
  const stored = row.custom_config?.image_urls;
  const urls = Array.isArray(stored)
    ? stored.filter((u): u is string => typeof u === 'string' && u.trim() !== '')
    : [];
  if (urls.length > 0) return urls;
  if (row.image_url) return [row.image_url];
  throw new Error('image_url kosong — row belum dirender');
}

export function buildSlideStates(row: SlideRow): RenderState[] {
  const cfg = row.custom_config ?? {};
  const decors = ((cfg.decors as string[] | undefined) ?? []).slice(0, MAX_DECORS);
  const from = typeof cfg.from === 'string' ? cfg.from : '';
  const to = typeof cfg.to === 'string' ? cfg.to : '';
  const slides = slidesOf(row);
  const texts = slides ?? [row.content];

  return texts.map((text, i) => ({
    template: row.template as RenderState['template'],
    content: composeFess(text, from, to),
    code: row.submission_code,
    decors: decors as RenderState['decors'],
    bg: row.bg_preset,
    ...(slides ? { slide: { index: i + 1, total: slides.length } } : {}),
  }));
}
