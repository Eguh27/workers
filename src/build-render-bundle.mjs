/* =========================================================
   Bundler bundle render: src/render-entry.ts (+ assets/templates.css)
   → src/render-bundle.js (IIFE, dievaluasi di headless Chrome).
   Dijalankan otomatis oleh `npm run worker` dan step workflow CI.
========================================================= */
import { build } from 'esbuild';

await build({
  entryPoints: ['src/render-entry.ts'],
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  outfile: 'src/render-bundle.js',
  loader: { '.css': 'text' },
  logLevel: 'info',
});
