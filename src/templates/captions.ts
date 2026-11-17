/* =========================================================
   Aturan teks pendamping (caption Instagram).
   Sekarang caption langsung mengambil dari isi pesan fess.
========================================================= */

export function captionTextFor(content = ''): string {
  return content;
}

export function captionFor(content = ''): string {
  return `${content}\n\n#menfess #umpomenfess`;
}
