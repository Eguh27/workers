/* =========================================================
   CAROUSEL — susun container carousel Instagram.

   Pemisahan yang penting: `createCarouselContainer` HANYA membuat
   container (child per slide + parent CAROUSEL) dan mengembalikan id
   parent. Publish dilakukan pemanggil lewat `media_publish` SEKALI.
   Kalau pembuatan container ikut mem-publish, `publish.ts` mem-publish
   id media sebagai creation id → Instagram membalas
   "Media Builder Not Found" padahal postnya sudah tayang (dobel post).

   Instagram yang menyusun slide-nya; satu fess = satu post, satu permalink.
   Fungsi menerima `deps` agar bisa dites tanpa menyentuh Graph API.
======================================================== */

export type GraphPost = (path: string, params: Record<string, string>) => Promise<Record<string, unknown>>;

export interface CarouselDeps {
  post: GraphPost;
  publish: (creationId: string) => Promise<string>;
}

/** Buat child container per slide + parent CAROUSEL; kembalikan id parent. */
export async function createCarouselContainer(
  urls: string[],
  caption: string,
  deps: Pick<CarouselDeps, 'post'>,
): Promise<string> {
  const children: string[] = [];
  for (const url of urls) {
    // caption hanya di parent; child tidak boleh punya caption
    const res = await deps.post('media', { image_url: url, is_carousel_item: 'true' });
    children.push(res.id as string);
  }
  const parent = await deps.post('media', {
    media_type: 'CAROUSEL',
    children: children.join(','),
    caption,
  });
  return parent.id as string;
}

/** Buat container lalu publish sekali — dipakai test; alur produksi memakai
 *  `createCarouselContainer` + `publishContainer` secara eksplisit. */
export async function publishCarousel(
  urls: string[],
  caption: string,
  deps: CarouselDeps,
): Promise<string> {
  return deps.publish(await createCarouselContainer(urls, caption, deps));
}
