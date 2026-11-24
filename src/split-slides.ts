/* =========================================================
   PEMECAH TEKS → SLIDE
   Satu fess panjang dipecah menjadi beberapa slide gambar.
   Aturan: mundur ke tanda akhir kalimat terakhir di dalam
   jendela, lalu spasi terakhir, lalu potong paksa. Tidak
   pernah memotong di tengah kata bila masih ada pilihan.
======================================================== */
import { MAX_SLIDES, SLIDE_MAX_LEN } from './templates';

/** indeks potong terbaik untuk sisa teks yang melebihi `max`.
 *  Mengembalikan 0 bila tidak ada titik potong yang masuk akal. */
function boundaryFor(text: string, max: number): number {
  const window = text.slice(0, max + 1);
  // 1. akhir kalimat
  for (const punct of ['. ', '! ', '? ', '\n']) {
    const i = window.lastIndexOf(punct);
    if (i > 0) return i + punct.length - 1;
  }
  // 2. spasi terakhir
  const space = window.lastIndexOf(' ');
  if (space > 0) return space;
  // 3. tidak ada pilihan: potong paksa
  return max;
}

export function splitSlides(
  text: string,
  max = SLIDE_MAX_LEN,
  maxSlides = MAX_SLIDES,
): string[] {
  const rest = text.trim();
  if (!rest) return [''];

  const slides: string[] = [];
  let remaining = rest;

  while (remaining.length > max && slides.length < maxSlides - 1) {
    const cut = boundaryFor(remaining, max);
    slides.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  slides.push(remaining);
  return slides;
}
