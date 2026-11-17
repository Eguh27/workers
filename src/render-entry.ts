/* =========================================================
   RENDER ENTRY (browser) — di-bundle esbuild menjadi
   src/render-bundle.js, lalu dievaluasi di dalam halaman
   headless Chrome oleh src/render.ts.

   Satu sumber markup: buildNode yang sama dipakai preview
   situs dan render worker, jadi preview = gambar final.
========================================================= */
import { buildNode } from './templates/render';
import type { RenderState } from './templates/render';
import cssText from '../assets/templates.css';

const style = document.createElement('style');
style.textContent = cssText;
document.head.appendChild(style);

window.__renderFess = (state: RenderState): void => {
  document.body.replaceChildren(buildNode(state));
};
