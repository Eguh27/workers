/* =========================================================
   PUBLISH CAROUSEL — child containers → parent CAROUSEL → publish.
   Instagram yang menyusun carousel-nya; satu fess = satu post,
   satu permalink. Fungsi menerima `deps` agar bisa dites tanpa
   menyentuh Graph API sungguhan.
======================================================== */

export type GraphPost = (path: string, params: Record<string, string>) => Promise<Record<string, unknown>>;

export interface CarouselDeps {
  post: GraphPost;
  publish: (creationId: string) => Promise<string>;
}

export async function publishCarousel(
  urls: string[],
  caption: string,
  deps: CarouselDeps,
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
  return deps.publish(parent.id as string);
}
