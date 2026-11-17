/* Deklarasi tipe untuk CSS yang di-bundle sebagai teks oleh esbuild
   (loader `text` di src/build-render-bundle.mjs). Harus berupa file
   ambient tanpa import/export agar deklarasinya global. */
declare module '*.css' {
  const text: string;
  export default text;
}
