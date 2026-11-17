/* Dukungan tipe untuk bundle render yang dievaluasi di halaman kosong:
   entry-nya mendaftarkan `window.__renderFess`, dan render.ts memanggilnya
   lewat `page.evaluate`. */
import type { RenderState } from './templates/render';

declare global {
  interface Window {
    __renderFess?: (state: RenderState) => void;
  }
}

export {};
