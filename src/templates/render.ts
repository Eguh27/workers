/* =========================================================
   BUILDER DOM TEMPLATE MENFESS v2 — markup untuk RENDER WORKER
   (headless Chrome via src/render.ts; bundle-nya src/render-entry.ts).
   Salinan dari src/lib/templates/render.ts di repo utama.
   Markup deterministik → apa yang terlihat di preview persis
   gambar final yang dipublish ke Instagram.

   DNA visual selaras landing: langit mint + matahari + gunung teal +
   koral, teks di panel kaca (glassmorphism). Semua konten penting
   (teks & kode) ada di zona tengah 540×540 → aman dicrop grid IG 3×3.
   CSS ada di assets/templates.css (scope .mfsp).

   Catatan: era renderer html2canvas sudah lewat — gotcha-nya
   (svg fill wajib rgb() bukan hex, hindari nama class bentrok dengan
   global.css, jangan andalkan backdrop-filter) tetap dipatuhi supaya
   preview & render konsisten di semua mesin.
========================================================= */
import type { DecorId, TemplateId } from './index';
import { bgPresetFor } from './index';

export interface RenderState {
  template: TemplateId;
  /** teks final (hasil composeFess) yang tampil di template */
  content: string;
  /** kode fess XXXX-XXXX */
  code: string;
  /** printilan Custom yang aktif */
  decors: DecorId[];
  /** id preset warna; null = tampilan bawaan template */
  bg?: string | null;
}

export const DESIGN_W = 540;
export const DESIGN_H = 675;

const TPL_CLASS: Record<TemplateId, string> = {
  langit: 'tpl-langit',
  kaca: 'tpl-kaca',
  stiker: 'tpl-stiker',
};

/** template tak dikenal (row warisan lama) jatuh ke langit */
const resolveTpl = (t: TemplateId | string): TemplateId =>
  t in TPL_CLASS ? (t as TemplateId) : 'langit';

/* ---------- ambang ladder ukuran teks per template (panjang karakter) ---------- */
const LADDER: Record<TemplateId, [number, number]> = {
  langit: [120, 210],
  kaca: [130, 220],
  stiker: [110, 200],
};

/* =========================================================
   MARKUP TEMPLATE
   Gunung template langit memakai pola SVG yang terbukti aman
   html2canvas 1.4.1 (sama dengan gigi struk): svg lewat innerHTML
   builder, ukuran via INLINE STYLE, warna via fill ATRIBUT konkret
   — stylesheet eksternal & CSS var TIDAK ikut saat html2canvas
   menserialisasi svg jadi gambar. Warna diambil dari preset.
========================================================= */
type BuilderColors = { m1?: string; m2?: string };

/** hex → rgb() — svg html2canvas diserialisasi tanpa escaping URL, jadi
 *  fill TIDAK BOLEH memakai hex (karakter "#" memotong data-URL). */
const hexToRgb = (hex: string | undefined, fallback: string): string => {
  const n = parseInt((hex && hex.startsWith('#') ? hex : fallback).slice(1), 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
};

const mountainsSvg = ({ m1, m2 }: BuilderColors) => `
<svg viewBox="0 0 540 190" preserveAspectRatio="none" aria-hidden="true" style="position:absolute;bottom:0;left:0;width:100%;height:190px;display:block">
  <polygon fill="${hexToRgb(m1, '#4C9E8F')}" points="-20,190 110,55 240,190"/>
  <polygon fill="${hexToRgb(m1, '#4C9E8F')}" points="150,190 300,35 450,190"/>
  <polygon fill="${hexToRgb(m1, '#4C9E8F')}" points="340,190 470,70 600,190"/>
  <polygon fill="${hexToRgb(m2, '#2F7268')}" points="-40,190 90,105 220,190"/>
  <polygon fill="${hexToRgb(m2, '#2F7268')}" points="120,190 260,85 400,190"/>
  <polygon fill="${hexToRgb(m2, '#2F7268')}" points="330,190 460,100 590,190"/>
  <polygon fill="rgb(253,246,233)" points="110,55 97,68 123,68"/>
  <polygon fill="rgb(253,246,233)" points="300,35 285,50 315,50"/>
  <polygon fill="rgb(253,246,233)" points="470,70 459,81 481,81"/>
</svg>`;

const BUILDERS: Record<TemplateId, (colors: BuilderColors) => string> = {
  langit: (colors) => `
    <div class="langit-sun"></div>
    <div class="cloud c1"></div>
    <div class="cloud c2"></div>
    ${mountainsSvg(colors)}
    <div class="glass g-langit">
      <div class="g-tag"><i></i>menfess anonim</div>
      <div class="quote-wrap"><div class="g-quote js-quote"></div></div>
      <div class="foot-rule">
        <span class="g-brand"><b class="g-logo"></b>umpomenfess</span>
        <span class="code-label js-code"></span>
      </div>
    </div>`,

  kaca: () => `
    <div class="blob b1"></div>
    <div class="blob b2"></div>
    <div class="blob b3"></div>
    <div class="kaca-glass">
      <div class="k-head">
        <span class="k-logo"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 4h16v12H10l-6 5z" fill="rgb(255,246,234)"/></svg></span>
        <div class="k-brand"><b>umpomenfess</b><span>menfess anonim &middot; UMPo</span></div>
        <span class="k-pill">anonim</span>
      </div>
      <div class="quote-wrap"><div class="k-quote js-quote"></div></div>
      <div class="foot-rule k-foot"><span>terkirim dengan berani &#10022;</span><span class="code-label js-code"></span></div>
    </div>`,

  stiker: () => `
    <div class="st-glass">
      <div class="st-tag">&#10022; pesan masuk</div>
      <div class="quote-wrap"><div class="st-quote js-quote"></div></div>
      <div class="foot-rule st-foot"><span class="code-label js-code"></span><span class="code-label">@umpomenfess</span></div>
    </div>`,
};

/* Stiker template "stiker" — dibuat via createElementNS, bukan innerHTML
   (elemen ber-transform + svg innerHTML = kombinasi yang dijatuhkan
   html2canvas; lihat komentar gotcha di atas). */
const STICKER_SPECS: Array<{ cls: string; w: number; h: number; vbW: number; vbH: number; inner: string }> = [
  {
    cls: 'sticker stk-photo', w: 70, h: 62, vbW: 70, vbH: 62,
    inner: '<rect x="2" y="2" width="66" height="58" rx="10" fill="rgb(251,243,228)" stroke="rgb(234,221,193)" stroke-width="3"/><circle cx="23" cy="20" r="7" fill="rgb(246,201,107)"/><path d="M9 45 L27 28 L38 39 L48 31 L61 45" fill="none" stroke="rgb(61,138,124)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    cls: 'sticker stk-chat', w: 60, h: 56, vbW: 60, vbH: 56,
    inner: '<rect x="2" y="2" width="56" height="38" rx="12" fill="rgb(245,165,75)" stroke="rgb(255,246,234)" stroke-width="3"/><path d="M17 39 L17 51 L30 39" fill="rgb(245,165,75)" stroke="rgb(255,246,234)" stroke-width="3" stroke-linejoin="round"/><path d="M30 16 c-5.5-5-13 1.5-5.5 8 l5.5 4.6 5.5-4.6 c7.5-6.5 0-13-5.5-8z" fill="rgb(255,246,234)"/>',
  },
  {
    cls: 'sticker stk-env', w: 64, h: 52, vbW: 64, vbH: 52,
    inner: '<rect x="2" y="4" width="60" height="44" rx="9" fill="rgb(232,96,76)" stroke="rgb(255,246,234)" stroke-width="3.5"/><path d="M6 11 L32 30 L58 11" fill="none" stroke="rgb(255,246,234)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
  },
];

/* =========================================================
   PRINTILAN — posisi dijaga di dalam/tepat di tepi safe-zone grid.
   Posisi deterministik per id; SVG via createElementNS.
========================================================= */
const svgNode = (w: number, h: number, vbW: number, vbH: number, inner: string): SVGSVGElement => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.innerHTML = inner;
  return svg;
};

/** SVG + wrapper div (pola aman html2canvas untuk elemen printilan). */
const svgEl = (w: number, h: number, inner: string): HTMLElement => {
  const wrap = document.createElement('div');
  wrap.appendChild(svgNode(w, h, w, h, inner));
  return wrap;
};

function el(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  return div.firstElementChild as HTMLElement;
}

const SPARK_INNER = '<path d="M22 0 L27 17 L44 22 L27 27 L22 44 L17 27 L0 22 L17 17 Z" fill="rgb(246,201,107)" stroke="rgb(255,253,244)" stroke-width="2.4" paint-order="stroke"/>';
const HEART_INNER = '<path d="M24 40 c-10-8-20 2-9 12 l9 7.5 9-7.5 c11-10 1-20-9-12z" fill="rgb(255,246,234)" transform="translate(0,-6)"/>';
const ENVELOPE_INNER = '<rect x="2" y="4" width="60" height="44" rx="9" fill="rgb(232,96,76)" stroke="rgb(255,246,234)" stroke-width="3.5"/><path d="M6 11 L32 30 L58 11" fill="none" stroke="rgb(255,246,234)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>';

const DECOR_SPECS: Record<DecorId, { build(): HTMLElement }> = {
  percik: {
    build: () => {
      const box = document.createElement('div');
      for (const s of ['top:17%;right:5.5%;width:46px;height:46px', 'bottom:24%;left:5%;width:32px;height:32px']) {
        const n = svgEl(44, 44, SPARK_INNER);
        n.classList.add('pd');
        n.setAttribute('style', s);
        box.appendChild(n);
      }
      return box;
    },
  },
  awan: {
    build: () => {
      const box = document.createElement('div');
      for (const s of ['top:8.5%;left:14%;width:92px', 'top:31%;right:4%;width:70px;opacity:.85']) {
        const n = el('<div class="pd pd-cloud"></div>');
        n.setAttribute('style', s);
        box.appendChild(n);
      }
      return box;
    },
  },
  love: {
    build: () => {
      const n = document.createElement('div');
      n.className = 'pd pd-love';
      n.appendChild(svgNode(26, 26, 48, 48, HEART_INNER));
      n.setAttribute('style', 'bottom:11.5%;right:6%;');
      const box = document.createElement('div');
      box.appendChild(n);
      return box;
    },
  },
  'stiker-mini': {
    build: () => {
      const n = el('<div class="pd"></div>');
      n.appendChild(svgNode(56, 46, 64, 52, ENVELOPE_INNER));
      n.setAttribute('style', 'top:9%;left:6%;transform:rotate(-8deg);');
      const box = document.createElement('div');
      box.appendChild(n);
      return box;
    },
  },
};

function applyDecors(frame: HTMLElement, state: RenderState): void {
  for (const id of state.decors) {
    const spec = DECOR_SPECS[id];
    if (!spec) continue; // id warisan lama → lewati
    const built = spec.build();
    while (built.firstChild) frame.appendChild(built.firstChild);
  }
}

/* =========================================================
   RENDER UTAMA
========================================================= */

/** Isi teks/kode ke node yang sudah dibangun. */
function applyText(frame: HTMLElement, state: RenderState, tpl: TemplateId): void {
  const quote = frame.querySelector<HTMLElement>('.js-quote');
  const n = state.content.length;
  if (quote) {
    quote.textContent = state.content || '…';
    const [s1, s2] = LADDER[tpl];
    quote.classList.toggle('s1', n > s1);
    quote.classList.toggle('s2', n > s2);
  }
  frame.querySelectorAll<HTMLElement>('.js-code').forEach((c) => { c.textContent = '#' + state.code; });
}

/** Terapkan preset warna via CSS custom properties yang dikaskade
 *  ke descendant template (opsional: backdrop .frame via preset.css). */
function applyBackground(frame: HTMLElement, state: RenderState, tpl: TemplateId): void {
  const preset = bgPresetFor(tpl, state.bg);
  if (!preset) return;
  if (preset.css) frame.style.background = preset.css;
  for (const [k, v] of Object.entries(preset.vars)) frame.style.setProperty(k, v);
}

function attachStickers(frame: HTMLElement): void {
  for (const s of STICKER_SPECS) {
    const wrap = document.createElement('div');
    wrap.className = s.cls;
    wrap.appendChild(svgNode(s.w, s.h, s.vbW, s.vbH, s.inner));
    frame.appendChild(wrap);
  }
}

/* Gunung kini dibangun lewat builder string dengan fill atribut konkret
   (lihat mountainsSvg) — warna preset dibaca langsung dari BG_PRESETS. */

/** Bangun node template (div.mfsp > div.frame) lengkap dengan teks & printilan. */
export function buildNode(state: RenderState): HTMLElement {
  const tpl = resolveTpl(state.template);
  const wrap = document.createElement('div');
  wrap.className = 'mfsp';
  const frame = document.createElement('div');
  frame.className = `frame ${TPL_CLASS[tpl]}`;
  const preset = bgPresetFor(tpl, state.bg);
  frame.innerHTML = BUILDERS[tpl]({ m1: preset?.vars['--m1'], m2: preset?.vars['--m2'] });
  applyBackground(frame, state, tpl);
  if (tpl === 'stiker') attachStickers(frame);
  applyText(frame, state, tpl);
  applyDecors(frame, state);
  wrap.appendChild(frame);
  return wrap;
}
