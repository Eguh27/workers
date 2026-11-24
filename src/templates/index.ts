/* =========================================================
   DATA TEMPLATE — single source of truth.
   Dipakai frontend (composer, preview) dan API (validasi).
   Template visual v2 selaras DNA landing (langit mint + matahari + gunung
   teal + koral, teks di panel kaca, aman crop grid IG 3×3); daftar
   template & printilan didefinisikan di sini, markup-nya di
   ./render.ts. Salinan dari src/lib/templates.ts di repo utama.

   Salinan ini dipakai WORKER: render headless Chrome (src/render.ts)
   540×675 ×2 → JPEG 1080×1350. Kalau template di repo utama berubah,
   file ini harus ikut disalin.
========================================================= */

export const MAX_LEN = 500;
export const MIN_LEN = 3;
export const FROM_TO_MAX = 32;

/** Batas karakter satu slide gambar; teks yang lebih panjang dipecah. */
export const SLIDE_MAX_LEN = 400;
/** Jumlah slide maksimum per fess (IG carousel mendukung 10). */
export const MAX_SLIDES = 4;

export type TemplateId = 'langit' | 'kaca' | 'stiker';

export interface TemplateDef {
  id: TemplateId;
  name: string;
  desc: string;
}

/** Template visual v2 — selaras DNA landing (langit mint, gunung teal, koral).
 *  Semua teks & kode ada di zona tengah 540×540 agar aman dicrop grid IG 3×3. */
export const TEMPLATES: TemplateDef[] = [
  { id: 'langit', name: 'Langit', desc: 'Langit mint, matahari, dan gunung teal  teks di panel kaca di tengah.' },
  { id: 'kaca',   name: 'Kaca',   desc: 'Studio terang dengan blob warna lembut dan kartu kaca besar di tengah.' },
  { id: 'stiker', name: 'Stiker', desc: 'Panel miring ala stiker tempelan dengan stiker surat, chat, dan foto di sekeliling.' },
];

/* ---------- preset warna per template ---------- */

export interface BgPreset {
  id: string;
  name: string;
  /** opsional: backdrop .frame; preset v2 murni lewat CSS vars aksen */
  css?: string;
  /** warna aksen template sebagai CSS custom properties (mis. --sky1, --kbg) */
  vars: Record<string, string>;
}

/**
 * Preset dikurasi per template: varian warna dalam satu keluarga palet
 * landing, diterapkan lewat CSS variables yang dikaskade ke descendant.
 * Tanpa preset = tampilan asli template. Gradien aman di level .frame —
 * yang bermasalah html2canvas hanya gradien pada elemen printilan.
 */
export const BG_PRESETS: Record<TemplateId, BgPreset[]> = {
  langit: [
    { id: 'senja', name: 'Senja', vars: { '--sky1': '#FFE0CA', '--sky2': '#F0A184', '--m1': '#DE8A68', '--m2': '#B85C48', '--ink': '#5E2D22' } },
    { id: 'fajar', name: 'Fajar', vars: { '--sky1': '#E6F2FA', '--sky2': '#B4D6EC', '--m1': '#7FA8C9', '--m2': '#4F7AA0', '--ink': '#2B4A63' } },
  ],
  kaca: [
    { id: 'blush', name: 'Blush', vars: { '--kbg': '#FDEEEC', '--b1': 'rgba(232,96,76,0.30)', '--b2': 'rgba(246,166,120,0.34)', '--b3': 'rgba(246,201,107,0.45)' } },
    { id: 'laut',  name: 'Laut',  vars: { '--kbg': '#EAF6F2', '--b1': 'rgba(61,138,124,0.28)', '--b2': 'rgba(76,158,143,0.30)', '--b3': 'rgba(246,201,107,0.45)' } },
  ],
  stiker: [
    { id: 'peach',       name: 'Peach',       vars: { '--st1': '#FFE9D6', '--st2': '#F5C6A8' } },
    { id: 'langit-biru', name: 'Langit biru', vars: { '--st1': '#E2F1FA', '--st2': '#BEDDEC' } },
  ],
};

/** Cari preset background untuk template; null/undefined = tampilan bawaan. */
export const bgPresetFor = (template: TemplateId, id: string | null | undefined): BgPreset | null =>
  id ? (BG_PRESETS[template] ?? []).find((p) => p.id === id) ?? null : null;

/* ---------- printilan (elemen hias ala Canva, auto nempel) ---------- */

export type DecorId = 'percik' | 'awan' | 'love' | 'stiker-mini';

export interface DecorDef {
  id: DecorId;
  label: string;
}

export const DECORS: DecorDef[] = [
  { id: 'percik',      label: 'Percik matahari' },
  { id: 'awan',        label: 'Awan ekstra' },
  { id: 'love',        label: 'Balon hati' },
  { id: 'stiker-mini', label: 'Stiker surat' },
];

export const MAX_DECORS = 4;

const DECOR_IDS = new Set<string>(DECORS.map((d) => d.id));

export const isValidDecors = (v: unknown): v is DecorId[] =>
  Array.isArray(v)
  && v.length <= MAX_DECORS
  && v.every((d) => typeof d === 'string' && DECOR_IDS.has(d))
  && new Set(v as string[]).size === (v as string[]).length;

/* ---------- from/to & kode fess ---------- */

/** Susun teks fess final: header from/to (opsional) + badan.
 *  Dipakai client (preview + render) DAN server (menyimpan) agar identik. */
export function composeFess(body: string, from = '', to = ''): string {
  const header = [
    from.trim() ? `from: ${from.trim()}` : '',
    to.trim() ? `to: ${to.trim()}` : '',
  ].filter(Boolean).join('\n');
  return [header, body.trim()].filter(Boolean).join('\n\n');
}

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa 0/O/1/I biar tidak membingungkan
export const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{4}-[${CODE_ALPHABET}]{4}$`);
